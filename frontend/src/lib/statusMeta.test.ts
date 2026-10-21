import { STATUS_ORDER, statusMeta } from './statusMeta'
import type { Status } from './types'

// If the API gains a status, this list and the metadata MUST gain it too: this test is the tripwire.
const ALL: Status[] = [
  'VERIFIED',
  'TAMPERED',
  'MISSING_FROM_DB',
  'DELETED_AUTHORIZED',
  'NOT_ANCHORED',
  'INCONSISTENT',
  'UNAVAILABLE',
]

describe('statusMeta', () => {
  it('describes every status the API can send, and nothing else', () => {
    expect(Object.keys(statusMeta).sort()).toEqual([...ALL].sort())
    expect([...STATUS_ORDER].sort()).toEqual([...ALL].sort())
    expect(new Set(STATUS_ORDER).size).toBe(ALL.length)
  })

  it.each(ALL)('%s has a label, an icon, a colour pair and a plain explanation', (status) => {
    const meta = statusMeta[status]
    expect(meta.label.length).toBeGreaterThan(2)
    expect(meta.icon.length).toBeGreaterThan(1)
    expect(meta.color).toMatch(/^var\(--/)
    expect(meta.bg).toMatch(/^var\(--/)
    expect(meta.explain.endsWith('.')).toBe(true)
  })

  it('uses the exact wording from the design spec', () => {
    expect(ALL.map((s) => statusMeta[s].label)).toEqual([
      'Verified',
      'Tampered',
      'Missing from database',
      'Deleted (authorised)',
      'Not anchored yet',
      'Inconsistent',
      'Chain unreachable',
    ])
  })

  it('never relies on colour alone: every status has its own icon', () => {
    const icons = ALL.map((s) => statusMeta[s].icon)
    expect(new Set(icons).size).toBe(ALL.length)
  })

  it('classifies what is good, what is wrong and what is unknown', () => {
    expect(statusMeta.VERIFIED.tone).toBe('ok')
    expect(statusMeta.DELETED_AUTHORIZED.tone).toBe('ok')
    expect(statusMeta.TAMPERED.tone).toBe('bad')
    expect(statusMeta.MISSING_FROM_DB.tone).toBe('warn')
    expect(statusMeta.INCONSISTENT.tone).toBe('warn')
    expect(statusMeta.NOT_ANCHORED.tone).toBe('neutral')
    expect(statusMeta.UNAVAILABLE.tone).toBe('neutral')
  })
})
