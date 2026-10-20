import type { Status } from './types'

export type IconName = 'check' | 'alert' | 'gap' | 'removed' | 'dash' | 'conflict' | 'offline'
export type Tone = 'ok' | 'bad' | 'warn' | 'neutral'

export interface StatusMeta {
  label: string
  icon: IconName
  tone: Tone
  /** CSS custom properties from tokens.css: a strong colour and its pale fill. */
  color: string
  bg: string
  /** One plain sentence saying what this status means. Shown in the inspector. */
  explain: string
}

export const statusMeta: Record<Status, StatusMeta> = {
  VERIFIED: {
    label: 'Verified',
    icon: 'check',
    tone: 'ok',
    color: 'var(--verified)',
    bg: 'var(--verified-bg)',
    explain: 'The database row matches the fingerprint the chain holds.',
  },
  TAMPERED: {
    label: 'Tampered',
    icon: 'alert',
    tone: 'bad',
    color: 'var(--tampered)',
    bg: 'var(--tampered-bg)',
    explain: 'The row no longer matches what the chain recorded, so it was changed outside the app.',
  },
  MISSING_FROM_DB: {
    label: 'Missing from database',
    icon: 'gap',
    tone: 'warn',
    color: 'var(--missing)',
    bg: 'var(--missing-bg)',
    explain: 'The chain remembers this record, but its row is gone and no authorised deletion was recorded.',
  },
  DELETED_AUTHORIZED: {
    label: 'Deleted (authorised)',
    icon: 'removed',
    tone: 'ok',
    color: 'var(--verified)',
    bg: 'var(--verified-bg)',
    explain: 'The record was removed through the app, and the chain recorded that deletion.',
  },
  NOT_ANCHORED: {
    label: 'Not anchored yet',
    icon: 'dash',
    tone: 'neutral',
    color: 'var(--slate)',
    bg: 'var(--slate-bg)',
    explain: 'No fingerprint for this record is on the chain yet, so there is nothing to check it against.',
  },
  INCONSISTENT: {
    label: 'Inconsistent',
    icon: 'conflict',
    tone: 'warn',
    color: 'var(--missing)',
    bg: 'var(--missing-bg)',
    explain: 'The chain says this record was deleted, but a row still exists in the database.',
  },
  UNAVAILABLE: {
    label: 'Chain unreachable',
    icon: 'offline',
    tone: 'neutral',
    color: 'var(--slate)',
    bg: 'var(--slate-bg)',
    explain: 'The chain could not be reached, so this record cannot be checked right now.',
  },
}

/** Display order: what a reader most needs to see first. */
export const STATUS_ORDER: Status[] = [
  'TAMPERED',
  'MISSING_FROM_DB',
  'INCONSISTENT',
  'UNAVAILABLE',
  'NOT_ANCHORED',
  'VERIFIED',
  'DELETED_AUTHORIZED',
]
