import type { KeyboardEvent, Ref } from 'react'
import { cx } from '../lib/cx'
import { timeAgo } from '../lib/format'
import type { RecordRow as Row } from '../lib/types'
import { StatusStamp } from './StatusStamp'
import styles from './Ledger.module.css'

interface Props {
  record: Row
  selected: boolean
  /** Roving tabindex: exactly one row in the ledger is a tab stop. */
  tabStop: boolean
  onSelect: (id: number) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  rowRef: Ref<HTMLDivElement>
}

export function RecordRow({ record, selected, tabStop, onSelect, onKeyDown, rowRef }: Props) {
  return (
    <div
      ref={rowRef}
      role="row"
      tabIndex={tabStop ? 0 : -1}
      aria-selected={selected}
      className={cx(styles.row, selected && styles.selected, !record.inDatabase && styles.ghostRow)}
      data-status={record.status}
      onClick={() => onSelect(record.id)}
      onKeyDown={onKeyDown}
    >
      <div role="gridcell" className={cx(styles.id, 'mono')}>
        #{record.id}
      </div>
      <div role="gridcell" className={styles.note}>
        {record.inDatabase ? (
          <span title={record.content ?? undefined}>{record.content}</span>
        ) : (
          <span className={styles.ghost}>Not in the database</span>
        )}
      </div>
      <div role="gridcell" className={styles.status}>
        <StatusStamp status={record.status} />
      </div>
      <div role="gridcell" className={cx(styles.version, 'mono')}>
        {record.version ? `v${record.version}` : '—'}
      </div>
      <div role="gridcell" className={styles.when}>
        {timeAgo(record.anchoredAt)}
      </div>
    </div>
  )
}
