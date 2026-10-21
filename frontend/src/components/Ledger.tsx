import { useRef, type KeyboardEvent } from 'react'
import type { RecordRow as Row } from '../lib/types'
import { EmptyState } from './EmptyState'
import { ErrorNotice } from './ErrorNotice'
import { RecordRow } from './RecordRow'
import styles from './Ledger.module.css'

interface Props {
  records: Row[] | undefined
  loading: boolean
  error: Error | null
  onRetry: () => void
  selectedId: number | null
  onSelect: (id: number) => void
  networkLabel: string
}

/** Every note with its live status. Arrow keys move through the rows; the selected row feeds the inspector. */
export function Ledger({ records, loading, error, onRetry, selectedId, onSelect, networkLabel }: Props) {
  const rows = useRef(new Map<number, HTMLDivElement>())

  if (error) {
    return <ErrorNotice title="Could not load the notes" message={error.message} onRetry={onRetry} />
  }

  if (loading || !records) {
    return (
      <div className={styles.ledger} aria-busy="true" aria-label="Loading notes">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeleton} aria-hidden="true" />
        ))}
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className={styles.ledger}>
        <EmptyState network={networkLabel} />
      </div>
    )
  }

  const move = (to: number) => {
    const target = records[Math.max(0, Math.min(records.length - 1, to))]
    onSelect(target.id)
    rows.current.get(target.id)?.focus()
  }

  const handleKey = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(index - 1)
        break
      case 'Home':
        event.preventDefault()
        move(0)
        break
      case 'End':
        event.preventDefault()
        move(records.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onSelect(records[index].id)
        break
    }
  }

  const tabStopId = selectedId !== null && records.some((r) => r.id === selectedId) ? selectedId : records[0].id

  return (
    <div className={styles.ledger} role="grid" aria-label="Notes" aria-rowcount={records.length + 1}>
      <div className={styles.head} role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Note</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Version</span>
        <span role="columnheader">Anchored</span>
      </div>
      {records.map((record, index) => (
        <RecordRow
          key={record.id}
          record={record}
          selected={record.id === selectedId}
          tabStop={record.id === tabStopId}
          onSelect={onSelect}
          onKeyDown={handleKey(index)}
          rowRef={(node) => {
            if (node) rows.current.set(record.id, node)
            else rows.current.delete(record.id)
          }}
        />
      ))}
    </div>
  )
}
