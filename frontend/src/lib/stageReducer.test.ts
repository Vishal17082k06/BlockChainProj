import { initialRun, runReducer, stepsFor, type RunState } from './stageReducer'
import type { StageEvent } from './types'

// Omit does not distribute over a union, so spread it per member.
type Without<T, K extends string> = T extends unknown ? Omit<T, K> : never
const ev = (event: Without<StageEvent, 't'> & { t?: number }): StageEvent => ({ t: 0, ...event }) as StageEvent
const feed = (state: RunState, ...events: StageEvent[]) =>
  events.reduce((s, event) => runReducer(s, { type: 'event', event }), state)
const status = (state: RunState) => state.steps.map((s) => `${s.id}:${s.status}`)

describe('stepsFor', () => {
  it('lists the real stages of each kind of write, in order', () => {
    expect(stepsFor('create')).toEqual(['saved', 'fingerprint', 'sent', 'mined'])
    expect(stepsFor('edit')).toEqual(['fingerprint', 'sent', 'mined'])
    expect(stepsFor('delete')).toEqual(['sent', 'mined', 'removed'])
  })
})

describe('runReducer', () => {
  it('starts idle with no steps', () => {
    expect(initialRun.phase).toBe('idle')
    expect(initialRun.steps).toEqual([])
  })

  it('start activates the first step and leaves the rest pending', () => {
    const s = runReducer(initialRun, { type: 'start', kind: 'create' })
    expect(s.phase).toBe('running')
    expect(status(s)).toEqual(['saved:active', 'fingerprint:pending', 'sent:pending', 'mined:pending'])
  })

  it('start remembers which note is being worked on, so it can be named while it runs', () => {
    const s = runReducer(initialRun, { type: 'start', kind: 'edit', noteId: 12 })
    expect(s.noteId).toBe(12)
    expect(runReducer(initialRun, { type: 'start', kind: 'create' }).noteId).toBeNull()
  })

  it('moves the active step forward as each real event arrives', () => {
    let s = runReducer(initialRun, { type: 'start', kind: 'create' })
    s = feed(s, ev({ stage: 'saved', noteId: 7, t: 10 }))
    expect(status(s)).toEqual(['saved:done', 'fingerprint:active', 'sent:pending', 'mined:pending'])
    expect(s.noteId).toBe(7)
    s = feed(s, ev({ stage: 'fingerprint', hash: 'ab'.repeat(32), t: 20 }))
    expect(s.fingerprint).toBe('ab'.repeat(32))
    s = feed(s, ev({ stage: 'sent', txHash: '0xfeed', explorerUrl: 'https://x/tx/0xfeed', t: 30 }))
    expect(status(s)).toEqual(['saved:done', 'fingerprint:done', 'sent:done', 'mined:active'])
    expect(s.txHash).toBe('0xfeed')
    expect(s.explorerUrl).toBe('https://x/tx/0xfeed')
    expect(s.elapsedMs).toBe(30)
  })

  it('records the mined details and finishes on done', () => {
    let s = runReducer(initialRun, { type: 'start', kind: 'edit' })
    s = feed(
      s,
      ev({ stage: 'fingerprint', hash: 'cd'.repeat(32) }),
      ev({ stage: 'sent', txHash: '0x1', explorerUrl: null }),
      ev({ stage: 'mined', block: 12, gasUsed: 81606, feeWei: '5', feeEth: '0.000000005', version: 2, t: 80 }),
      ev({ stage: 'done', noteId: 4, t: 90 }),
    )
    expect(s.phase).toBe('done')
    expect(status(s)).toEqual(['fingerprint:done', 'sent:done', 'mined:done'])
    expect(s).toMatchObject({ block: 12, gasUsed: 81606, feeEth: '0.000000005', version: 2, noteId: 4, elapsedMs: 90 })
  })

  it('a delete runs sent, mined, removed', () => {
    let s = runReducer(initialRun, { type: 'start', kind: 'delete' })
    s = feed(
      s,
      ev({ stage: 'sent', txHash: '0x2', explorerUrl: null }),
      ev({ stage: 'mined', block: 3, gasUsed: 52519, feeWei: '1', feeEth: '0.000000001' }),
    )
    expect(status(s)).toEqual(['sent:done', 'mined:done', 'removed:active'])
    expect(s.version).toBeNull()
    s = feed(s, ev({ stage: 'removed' }), ev({ stage: 'done', noteId: 4 }))
    expect(s.phase).toBe('done')
    expect(status(s)).toEqual(['sent:done', 'mined:done', 'removed:done'])
  })

  it('a failure marks the active step failed, keeps the reason, and ignores later events', () => {
    let s = runReducer(initialRun, { type: 'start', kind: 'create' })
    s = feed(
      s,
      ev({ stage: 'saved', noteId: 1 }),
      ev({ stage: 'fingerprint', hash: 'ab'.repeat(32) }),
      ev({ stage: 'failed', code: 'CHAIN_UNAVAILABLE', message: 'Node unreachable', t: 40 }),
    )
    expect(s.phase).toBe('failed')
    expect(status(s)).toEqual(['saved:done', 'fingerprint:done', 'sent:failed', 'mined:pending'])
    expect(s.failure).toEqual({ code: 'CHAIN_UNAVAILABLE', message: 'Node unreachable' })
    const after = feed(s, ev({ stage: 'sent', txHash: '0xlate', explorerUrl: null }))
    expect(after).toEqual(s)
  })

  it('an edit refused before anything happens fails on the first step', () => {
    let s = runReducer(initialRun, { type: 'start', kind: 'edit' })
    s = feed(s, ev({ stage: 'failed', code: 'REFUSED', message: 'Edit refused' }))
    expect(status(s)).toEqual(['fingerprint:failed', 'sent:pending', 'mined:pending'])
  })

  it('done marks every step done even if an earlier event was missed', () => {
    let s = runReducer(initialRun, { type: 'start', kind: 'create' })
    s = feed(s, ev({ stage: 'done', noteId: 9 }))
    expect(status(s)).toEqual(['saved:done', 'fingerprint:done', 'sent:done', 'mined:done'])
  })

  it('ignores events when no run is in progress, and reset returns to idle', () => {
    expect(feed(initialRun, ev({ stage: 'saved', noteId: 1 }))).toEqual(initialRun)
    let s = runReducer(initialRun, { type: 'start', kind: 'create' })
    s = runReducer(s, { type: 'reset' })
    expect(s).toEqual(initialRun)
  })

  it('a fresh start clears everything from the previous run', () => {
    let s = runReducer(initialRun, { type: 'start', kind: 'edit' })
    s = feed(s, ev({ stage: 'failed', code: 'REFUSED', message: 'no' }))
    s = runReducer(s, { type: 'start', kind: 'create' })
    expect(s.failure).toBeNull()
    expect(s.phase).toBe('running')
  })
})
