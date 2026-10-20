import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useWrite } from './useWrite'
import { ApiError, writeStream } from '../lib/api'
import type { ActivityInput } from '../lib/activity'
import type { StageEvent } from '../lib/types'

vi.mock('../lib/api', async (original) => {
  const actual = await original<typeof import('../lib/api')>()
  return { ...actual, writeStream: vi.fn() }
})

const stream = vi.mocked(writeStream)
const ev = (event: object) => ({ t: 1, ...event }) as StageEvent

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const recorded: ActivityInput[] = []
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useWrite('local', (line) => recorded.push(line)), { wrapper })
  return { ...hook, invalidate, recorded }
}

function emit(...events: StageEvent[]) {
  stream.mockImplementation(async function* () {
    for (const event of events) yield event
  })
}

beforeEach(() => stream.mockReset())

describe('useWrite', () => {
  it('runs a create through its real stages and reports done', async () => {
    emit(
      ev({ stage: 'saved', noteId: 5 }),
      ev({ stage: 'fingerprint', hash: 'ab'.repeat(32) }),
      ev({ stage: 'sent', txHash: '0xfeed', explorerUrl: null }),
      ev({ stage: 'mined', block: 3, gasUsed: 98706, feeWei: '1', feeEth: '0.000084331', version: 1 }),
      ev({ stage: 'done', noteId: 5 }),
    )
    const { result } = setup()
    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.start({ kind: 'create', content: 'Hello' })
    })
    expect(outcome).toBe('done')
    expect(result.current.run.phase).toBe('done')
    expect(result.current.run.txHash).toBe('0xfeed')
    expect(result.current.run.noteId).toBe(5)
    expect(result.current.busy).toBe(false)
    expect(stream).toHaveBeenCalledWith('local', { kind: 'create', content: 'Hello' })
  })

  it('writes each real stage to the activity tape, except done', async () => {
    emit(
      ev({ stage: 'saved', noteId: 5 }),
      ev({ stage: 'sent', txHash: '0xfeed', explorerUrl: null }),
      ev({ stage: 'done', noteId: 5 }),
    )
    const { result, recorded } = setup()
    await act(async () => {
      await result.current.start({ kind: 'create', content: 'x' })
    })
    expect(recorded.map((r) => r.tag)).toEqual(['SAVED', 'SENT'])
  })

  it('reports a failure streamed by the API as failed, keeping the reason', async () => {
    emit(ev({ stage: 'failed', code: 'REFUSED', message: 'Edit refused.' }))
    const { result } = setup()
    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.start({ kind: 'edit', id: 2, content: 'new' })
    })
    expect(outcome).toBe('failed')
    expect(result.current.run.phase).toBe('failed')
    expect(result.current.run.failure).toEqual({ code: 'REFUSED', message: 'Edit refused.' })
    expect(result.current.run.noteId).toBe(2)
  })

  it('turns a busy refusal (thrown before any event) into a failed run with the BUSY code', async () => {
    stream.mockImplementation(async function* () {
      throw new ApiError(409, 'BUSY', 'Another write is still running.')
    })
    const { result, recorded } = setup()
    await act(async () => {
      await result.current.start({ kind: 'create', content: 'x' })
    })
    expect(result.current.run.failure).toEqual({ code: 'BUSY', message: 'Another write is still running.' })
    expect(recorded.at(-1)).toMatchObject({ tag: 'FAILED', tone: 'bad' })
  })

  it('treats an unreachable API as the chain being unreachable, with its message', async () => {
    stream.mockImplementation(async function* () {
      throw new ApiError(0, 'UNAVAILABLE', 'Could not reach the Witness API.')
    })
    const { result } = setup()
    await act(async () => {
      await result.current.start({ kind: 'delete', id: 1 })
    })
    expect(result.current.run.failure).toEqual({ code: 'CHAIN_UNAVAILABLE', message: 'Could not reach the Witness API.' })
  })

  it('maps invalid input to the INVALID code', async () => {
    stream.mockImplementation(async function* () {
      throw new ApiError(422, 'INVALID', 'That note is empty or too long.')
    })
    const { result } = setup()
    await act(async () => {
      await result.current.start({ kind: 'create', content: '' })
    })
    expect(result.current.run.failure?.code).toBe('INVALID')
  })

  it('refuses to start a second write while one is running, without calling the API again', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    stream.mockImplementation(async function* () {
      yield ev({ stage: 'saved', noteId: 1 })
      await gate
      yield ev({ stage: 'done', noteId: 1 })
    })
    const { result } = setup()
    let first!: Promise<string>
    await act(async () => {
      first = result.current.start({ kind: 'create', content: 'one' })
      await Promise.resolve()
    })
    expect(result.current.busy).toBe(true)
    let second: string | undefined
    await act(async () => {
      second = await result.current.start({ kind: 'create', content: 'two' })
    })
    expect(second).toBe('busy')
    expect(stream).toHaveBeenCalledTimes(1)
    await act(async () => {
      release()
      await first
    })
    expect(result.current.busy).toBe(false)
  })

  it('refreshes the records afterwards, on success AND on failure', async () => {
    emit(ev({ stage: 'done', noteId: 1 }))
    const ok = setup()
    await act(async () => {
      await ok.result.current.start({ kind: 'create', content: 'x' })
    })
    expect(ok.invalidate).toHaveBeenCalledWith({ queryKey: ['records', 'local'] })
    expect(ok.invalidate).toHaveBeenCalledWith({ queryKey: ['record', 'local'] })

    emit(ev({ stage: 'failed', code: 'INTERNAL', message: 'boom' }))
    const bad = setup()
    await act(async () => {
      await bad.result.current.start({ kind: 'create', content: 'x' })
    })
    expect(bad.invalidate).toHaveBeenCalledWith({ queryKey: ['records', 'local'] })
  })

  it('dismiss returns to idle', async () => {
    emit(ev({ stage: 'done', noteId: 1 }))
    const { result } = setup()
    await act(async () => {
      await result.current.start({ kind: 'create', content: 'x' })
    })
    act(() => result.current.dismiss())
    expect(result.current.run.phase).toBe('idle')
  })
})
