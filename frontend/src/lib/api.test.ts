import { ApiError, api, writeStream } from './api'
import type { StageEvent } from './types'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function ndjson(...events: object[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function collect(iterable: AsyncIterable<StageEvent>) {
  const out: StageEvent[] = []
  for await (const e of iterable) out.push(e)
  return out
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    return error as ApiError
  }
  throw new Error('expected the request to fail')
}

describe('reads', () => {
  it('fetches records for the chosen network', async () => {
    fetchMock.mockResolvedValue(json({ summary: { VERIFIED: 1 }, records: [] }))
    expect(await api.records('sepolia')).toEqual({ summary: { VERIFIED: 1 }, records: [] })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/sepolia/records')
  })

  it('fetches the network list and one record', async () => {
    fetchMock.mockResolvedValueOnce(json([{ id: 'local' }])).mockResolvedValueOnce(json({ id: 4 }))
    expect(await api.networks()).toEqual([{ id: 'local' }])
    expect(await api.record('local', 4)).toEqual({ id: 4 })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/local/records/4')
  })

  it('polls the cheap pulse endpoint for one network', async () => {
    fetchMock.mockResolvedValue(json({ blockNumber: 12, balanceEth: '0.033379' }))
    expect(await api.pulse('sepolia')).toEqual({ blockNumber: 12, balanceEth: '0.033379' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/sepolia/pulse')
  })

  it('posts verify-all', async () => {
    fetchMock.mockResolvedValue(json({ summary: {}, results: [] }))
    await api.verifyAll('local')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/local/verify-all')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })
})

describe('errors', () => {
  it('turns a 503 with a reason into a readable error', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'The local node is not reachable.' }, 503))
    const error = await failure(api.records('local'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(503)
    expect(error.code).toBe('UNAVAILABLE')
    expect(error.message).toBe('The local node is not reachable.')
  })

  it('maps 404 to NOT_FOUND', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'No such record' }, 404))
    expect((await failure(api.record('local', 9))).code).toBe('NOT_FOUND')
  })

  it('says plainly when the Witness API itself cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await failure(api.networks())
    expect(error.code).toBe('UNAVAILABLE')
    expect(error.message).toContain('run_ui.py')
  })
})

describe('writeStream', () => {
  it('posts a new note and yields the streamed events', async () => {
    const events = [
      { stage: 'saved', noteId: 3, t: 1 },
      { stage: 'done', noteId: 3, t: 9 },
    ]
    fetchMock.mockResolvedValue(ndjson(...events))
    const got = await collect(writeStream('local', { kind: 'create', content: 'Hello' }))
    expect(got).toEqual(events)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/local/notes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ content: 'Hello' })
  })

  it('uses PUT for an edit and DELETE for a delete', async () => {
    fetchMock.mockImplementation(async () => ndjson({ stage: 'done', noteId: 5, t: 1 }))
    await collect(writeStream('sepolia', { kind: 'edit', id: 5, content: 'New text' }))
    await collect(writeStream('sepolia', { kind: 'delete', id: 5 }))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/sepolia/notes/5')
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
  })

  it('maps 409 to BUSY before any event', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'Another write is still running.' }, 409))
    const error = await failure(collect(writeStream('local', { kind: 'create', content: 'x' })))
    expect(error.code).toBe('BUSY')
    expect(error.message).toBe('Another write is still running.')
  })

  it('maps 422 to INVALID with a friendly message', async () => {
    fetchMock.mockResolvedValue(json({ detail: [{ msg: 'String should have at least 1 character' }] }, 422))
    const error = await failure(collect(writeStream('local', { kind: 'create', content: '' })))
    expect(error.code).toBe('INVALID')
    expect(error.message).toContain('1 to 500 characters')
  })
})

describe('attack', () => {
  it('posts the chosen attack to its own endpoint', async () => {
    fetchMock.mockResolvedValue(json({ ok: true, detail: 'Note 2 was changed.' }))
    const result = await api.attack('local', 'edit', { id: 2, content: 'forged', coverTracks: true })
    expect(result).toEqual({ ok: true, detail: 'Note 2 was changed.' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/local/attack/edit')
    expect(JSON.parse(init.body)).toEqual({ id: 2, content: 'forged', coverTracks: true })
  })
})
