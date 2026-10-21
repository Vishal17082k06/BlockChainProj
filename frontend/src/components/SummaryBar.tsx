import { useEffect, useState, type CSSProperties } from 'react'
import { formatElapsed, timeAgo } from '../lib/format'
import { STATUS_ORDER, statusMeta } from '../lib/statusMeta'
import type { StatusSummary } from '../lib/types'
import { Icon } from './icons'
import styles from './SummaryBar.module.css'

interface Props {
  summary: StatusSummary
  checking: boolean
  /** When the records were last checked against the chain (unix seconds), or null. */
  checkedAt: number | null
  /** How long the last check took, in milliseconds. */
  checkMs: number | null
  disabled: boolean
  onVerifyAll: () => void
}

export function SummaryBar({ summary, checking, checkedAt, checkMs, disabled, onVerifyAll }: Props) {
  // Re-render every few seconds so "checked 8 s ago" stays honest.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 5000)
    return () => window.clearInterval(id)
  }, [])

  const present = STATUS_ORDER.filter((status) => (summary[status] ?? 0) > 0)
  const total = present.reduce((sum, status) => sum + (summary[status] ?? 0), 0)
  const description = present.map((s) => `${summary[s]} ${statusMeta[s].label.toLowerCase()}`).join(', ')

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {total > 0 ? (
          <>
            <div className={styles.meter} role="img" aria-label={`${total} records: ${description}`}>
              {present.map((status) => (
                <span
                  key={status}
                  className={styles.segment}
                  style={{ flexGrow: summary[status], '--c': statusMeta[status].color } as CSSProperties}
                />
              ))}
            </div>
            <ul className={styles.legend}>
              {present.map((status) => (
                <li key={status} style={{ '--c': statusMeta[status].color } as CSSProperties}>
                  <span className={styles.swatch} aria-hidden="true" />
                  <strong className="mono">{summary[status]}</strong> {statusMeta[status].label}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.quiet}>No records to check yet.</p>
        )}
      </div>

      <div className={styles.right}>
        {checkedAt !== null && !checking && (
          <span className={styles.checked}>
            Checked {timeAgo(checkedAt)}
            {checkMs !== null && <> in {formatElapsed(checkMs)}</>}
          </span>
        )}
        <button type="button" className={styles.verify} onClick={onVerifyAll} disabled={disabled || checking}>
          <Icon name="scan" size={16} />
          {checking ? 'Verifying…' : 'Verify all'}
        </button>
      </div>
    </div>
  )
}
