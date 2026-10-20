// Shapes of everything the API sends. Mirrors docs/specs/2026-10-21-demo-console-design.md section 4.

export type NetworkId = 'local' | 'sepolia'

export type Status =
  | 'VERIFIED'
  | 'TAMPERED'
  | 'MISSING_FROM_DB'
  | 'DELETED_AUTHORIZED'
  | 'NOT_ANCHORED'
  | 'INCONSISTENT'
  | 'UNAVAILABLE'

export interface NetworkInfo {
  id: NetworkId
  label: string
  ready: boolean
  reason: string | null
  chainId: number | null
  blockNumber: number | null
  wallet: string | null
  balanceEth: string | null
  owner: string | null
  contracts: { integrity: string | null; merkle: string | null }
  explorer: string | null
}

export interface Pulse {
  blockNumber: number
  balanceEth: string
}

export interface RecordRow {
  id: number
  content: string | null
  status: Status
  version: number | null
  anchoredAt: number | null
  inDatabase: boolean
}

export type StatusSummary = Partial<Record<Status, number>>

export interface RecordsResponse {
  summary: StatusSummary
  records: RecordRow[]
}

export interface VersionEntry {
  version: number
  hash: string
  timestamp: number
  txHash: string
  block: number
  explorerUrl: string | null
}

export interface RecordDetail {
  id: number
  status: Status
  row: { content: string } | null
  fingerprint: { database: string | null; chain: string | null; matches: boolean }
  deleted: boolean
  versions: VersionEntry[]
  deletion: { txHash: string; block: number; timestamp: number; explorerUrl: string | null } | null
}

export type FailureCode =
  | 'REFUSED'
  | 'CHAIN_UNAVAILABLE'
  | 'WRONG_NETWORK'
  | 'LOW_BALANCE'
  | 'TX_FAILED'
  | 'INTERNAL'
  | 'INVALID'
  | 'BUSY'

export type StageEvent = { t: number } & (
  | { stage: 'saved'; noteId: number }
  | { stage: 'fingerprint'; hash: string }
  | { stage: 'sent'; txHash: string; explorerUrl: string | null }
  | { stage: 'mined'; block: number; gasUsed: number; feeWei: string; feeEth: string; version?: number }
  | { stage: 'removed' }
  | { stage: 'done'; noteId: number }
  | { stage: 'failed'; code: FailureCode; message: string }
)

export type WriteKind = 'create' | 'edit' | 'delete'

export type WriteOp =
  | { kind: 'create'; content: string }
  | { kind: 'edit'; id: number; content: string }
  | { kind: 'delete'; id: number }

export type AttackKind = 'edit' | 'delete' | 'restore'

export interface AttackRequest {
  id: number
  content?: string
  coverTracks: boolean
}

export interface AttackResult {
  ok: boolean
  detail: string
}
