import { parseNdjson } from './ndjson'
import type { StageEvent } from './types'

function streamOf(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<StageEvent[]> {
  const out: StageEvent[] = []
  for await (const event of parseNdjson(stream)) out.push(event)
  return out
}

const saved = { stage: 'saved', noteId: 1, t: 5 }
const sent = { stage: 'sent', txHash: '0xabc', explorerUrl: null, t: 9 }

describe('parseNdjson', () => {
  it('yields one event per line', async () => {
    const events = await collect(streamOf(JSON.stringify(saved) + '\n' + JSON.stringify(sent) + '\n'))
    expect(events).toEqual([saved, sent])
  })

  it('handles an event split across chunks', async () => {
    const line = JSON.stringify(saved) + '\n'
    const events = await collect(streamOf(line.slice(0, 7), line.slice(7, 20), line.slice(20)))
    expect(events).toEqual([saved])
  })

  it('handles several events delivered in one chunk', async () => {
    const events = await collect(streamOf(JSON.stringify(saved) + '\n' + JSON.stringify(sent) + '\n'))
    expect(events.map((e) => e.stage)).toEqual(['saved', 'sent'])
  })

  it('parses a final line that has no trailing newline', async () => {
    const events = await collect(streamOf(JSON.stringify(saved) + '\n', JSON.stringify(sent)))
    expect(events.map((e) => e.stage)).toEqual(['saved', 'sent'])
  })

  it('ignores blank lines', async () => {
    const events = await collect(streamOf('\n\n' + JSON.stringify(saved) + '\n\n   \n'))
    expect(events).toEqual([saved])
  })

  it('does not corrupt a multi-byte character split across chunks', async () => {
    const event = { stage: 'failed', code: 'REFUSED', message: 'Edit refused – €', t: 1 }
    const bytes = new TextEncoder().encode(JSON.stringify(event) + '\n')
    const euro = bytes.indexOf(0xe2)                                   // first byte of the dash or euro sign
    const events = await collect(streamOf(bytes.slice(0, euro + 1), bytes.slice(euro + 1)))
    expect(events).toEqual([event])
  })

  it('turns an unreadable line into a failed event and stops', async () => {
    // The good line is in the SAME chunk as the bad one: only an explicit stop keeps it out.
    const events = await collect(streamOf(JSON.stringify(saved) + '\n', 'not json\n' + JSON.stringify(sent) + '\n'))
    expect(events.map((e) => e.stage)).toEqual(['saved', 'failed'])
    const failure = events[1]
    expect(failure.stage === 'failed' && failure.code).toBe('INVALID')
  })
})
