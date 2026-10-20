import { cx } from '../lib/cx'
import { shortHash, timeAgo } from '../lib/format'
import type { ActivityItem } from '../lib/activity'
import { Icon } from './icons'
import styles from './ActivityTape.module.css'

interface Props {
  items: ActivityItem[]
  expanded: boolean
  onToggle: () => void
  onClear: () => void
}

function Line({ item }: { item: ActivityItem }) {
  return (
    <li className={cx(styles.line, styles[item.tone])}>
      <span className={styles.tag}>{item.tag}</span>
      <span className={styles.text}>{item.text}</span>
      <span className={styles.net}>{item.network === 'sepolia' ? 'Sepolia' : 'Local'}</span>
      {item.txHash &&
        (item.explorerUrl ? (
          <a className={cx(styles.tx, 'mono')} href={item.explorerUrl} target="_blank" rel="noreferrer">
            {shortHash(item.txHash, 8, 4)} <Icon name="external" size={11} />
          </a>
        ) : (
          <span className={cx(styles.tx, 'mono')}>{shortHash(item.txHash, 8, 4)}</span>
        ))}
      <time className={styles.when}>{timeAgo(item.at)}</time>
    </li>
  )
}

/** A running record of everything that happened this session, newest first. */
export function ActivityTape({ items, expanded, onToggle, onClear }: Props) {
  const latest = items[0]
  return (
    <section className={cx(styles.tape, expanded && styles.open)} aria-label="Activity">
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.toggle}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="activity-list"
        >
          <Icon name="chevron" size={14} className={styles.chevron} />
          <span className={styles.label}>Activity</span>
          <span className={styles.count}>{items.length}</span>
        </button>
        {!expanded && (
          <p className={styles.latest} role="status" aria-live="polite">
            {latest ? `${latest.tag} · ${latest.text}` : 'Nothing has happened yet. Anchor a note to begin.'}
          </p>
        )}
        {expanded && items.length > 0 && (
          <button type="button" className={styles.clear} onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {expanded && (
        <div id="activity-list" className={styles.body}>
          {items.length === 0 ? (
            <p className={styles.empty}>Every step of every write and attack shows up here as it happens.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => (
                <Line key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
