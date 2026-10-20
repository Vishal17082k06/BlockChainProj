import { formatBlock, formatEth, formatGas, shortHash } from './format'
import type { NetworkId, StageEvent } from './types'

export type ActivityTag =
  | 'SAVED'
  | 'FINGERPRINT'
  | 'SENT'
  | 'MINED'
  | 'REMOVED'
  | 'FAILED'
  | 'ATTACK'
  | 'VERIFY'

export type ActivityTone = 'neutral' | 'ok' | 'bad' | 'attack'

export interface ActivityInput {
  tag: ActivityTag
  text: string
  tone: ActivityTone
  network: NetworkId
  txHash?: string
  explorerUrl?: string | null
}

export interface ActivityItem extends ActivityInput {
  id: number
  at: number
}

export type ActivityAction =
  | { type: 'push'; input: ActivityInput; at: number; id: number }
  | { type: 'clear' }

const KEEP = 200

/** Turns one real stage into a line for the activity tape, or null when it adds nothing. */
export function fromStage(event: StageEvent, network: NetworkId): ActivityInput | null {
  switch (event.stage) {
    case 'saved':
      return { tag: 'SAVED', text: `Saved note ${event.noteId} to the database`, tone: 'neutral', network }
    case 'fingerprint':
      return { tag: 'FINGERPRINT', text: `Fingerprint made ${shortHash(event.hash, 8, 4)}`, tone: 'neutral', network }
    case 'sent':
      return { tag: 'SENT', text: 'Transaction sent', tone: 'neutral', network, txHash: event.txHash, explorerUrl: event.explorerUrl }
    case 'mined':
      return {
        tag: 'MINED',
        text: `Mined in block ${formatBlock(event.block)} · ${formatGas(event.gasUsed)} gas · ${formatEth(event.feeEth)} ETH`,
        tone: 'ok',
        network,
      }
    case 'removed':
      return { tag: 'REMOVED', text: 'Row removed from the database', tone: 'neutral', network }
    case 'failed':
      return { tag: 'FAILED', text: event.message, tone: 'bad', network }
    case 'done':
      return null
  }
}

export function activityReducer(items: ActivityItem[], action: ActivityAction): ActivityItem[] {
  if (action.type === 'clear') return []
  return [{ ...action.input, id: action.id, at: action.at }, ...items].slice(0, KEEP)
}
