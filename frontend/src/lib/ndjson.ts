import type { StageEvent } from './types'

const UNREADABLE: StageEvent = {
  t: 0,
  stage: 'failed',
  code: 'INVALID',
  message: 'The server sent a response the console could not read.',
}

function parse(line: string): StageEvent | null {
  try {
    return JSON.parse(line) as StageEvent
  } catch {
    return null
  }
}

/** Turns a streaming response body (one JSON object per line) into events as each line arrives. */
export async function* parseNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<StageEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      // stream: true keeps a multi-byte character that is split across chunks intact
      buffer += decoder.decode(value, { stream: !done })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) {
          const event = parse(line)
          if (!event) {
            reader.cancel().catch(() => undefined)
            yield UNREADABLE
            return
          }
          yield event
        }
        newline = buffer.indexOf('\n')
      }
      if (done) break
    }
    const rest = buffer.trim()
    if (rest) yield parse(rest) ?? UNREADABLE
  } finally {
    reader.releaseLock()
  }
}
