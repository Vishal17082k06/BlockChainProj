import { activityReducer, fromStage, type ActivityInput } from './activity'
import type { StageEvent } from './types'

const ev = (event: object) => ({ t: 0, ...event }) as StageEvent

describe('fromStage', () => {
  it('describes each real stage in plain words', () => {
    expect(fromStage(ev({ stage: 'saved', noteId: 7 }), 'local')).toMatchObject({
      tag: 'SAVED', text: 'Saved note 7 to the database', tone: 'neutral', network: 'local',
    })
    expect(fromStage(ev({ stage: 'fingerprint', hash: 'ab'.repeat(32) }), 'local')).toMatchObject({
      tag: 'FINGERPRINT', text: expect.stringContaining('abababab'),
    })
    expect(fromStage(ev({ stage: 'removed' }), 'local')).toMatchObject({ tag: 'REMOVED' })
  })

  it('carries the transaction hash and link on the sent stage', () => {
    const out = fromStage(ev({ stage: 'sent', txHash: '0xfeed', explorerUrl: 'https://x/tx/0xfeed' }), 'sepolia')
    expect(out).toMatchObject({ tag: 'SENT', txHash: '0xfeed', explorerUrl: 'https://x/tx/0xfeed', network: 'sepolia' })
  })

  it('reports the real block, gas and fee on the mined stage', () => {
    const out = fromStage(
      ev({ stage: 'mined', block: 11953418, gasUsed: 6695317, feeWei: '1', feeEth: '0.010042975000', version: 1 }),
      'sepolia',
    ) as ActivityInput
    expect(out.tag).toBe('MINED')
    expect(out.text).toBe('Mined in block 11,953,418 · 6,695,317 gas · 0.010042975 ETH')
    expect(out.tone).toBe('ok')
  })

  it('marks a failure as bad and keeps the plain message', () => {
    const out = fromStage(ev({ stage: 'failed', code: 'REFUSED', message: 'Edit refused.' }), 'local') as ActivityInput
    expect(out).toMatchObject({ tag: 'FAILED', tone: 'bad', text: 'Edit refused.' })
  })

  it('has nothing to add for done: the stages before it already told the story', () => {
    expect(fromStage(ev({ stage: 'done', noteId: 1 }), 'local')).toBeNull()
  })
})

describe('activityReducer', () => {
  const input = (text: string): ActivityInput => ({ tag: 'SAVED', text, tone: 'neutral', network: 'local' })

  it('keeps the newest item first', () => {
    let items = activityReducer([], { type: 'push', input: input('first'), at: 1, id: 1 })
    items = activityReducer(items, { type: 'push', input: input('second'), at: 2, id: 2 })
    expect(items.map((i) => i.text)).toEqual(['second', 'first'])
    expect(items[0]).toMatchObject({ id: 2, at: 2 })
  })

  it('keeps only the most recent 200 items', () => {
    let items: ReturnType<typeof activityReducer> = []
    for (let i = 0; i < 230; i++) items = activityReducer(items, { type: 'push', input: input(`n${i}`), at: i, id: i })
    expect(items).toHaveLength(200)
    expect(items[0].text).toBe('n229')
  })

  it('can be cleared', () => {
    const items = activityReducer([], { type: 'push', input: input('x'), at: 1, id: 1 })
    expect(activityReducer(items, { type: 'clear' })).toEqual([])
  })
})
