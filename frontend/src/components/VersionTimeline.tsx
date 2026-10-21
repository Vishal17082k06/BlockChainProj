import { useId } from 'react'
import { cx } from '../lib/cx'
import { formatBlock, shortHash, timeAgo } from '../lib/format'
import type { RecordDetail, VersionEntry } from '../lib/types'
import { CopyButton } from './CopyButton'
import { Icon } from './icons'
import styles from './VersionTimeline.module.css'

interface Entry {
  key: string
  title: string
  tag: string | null
  timestamp: number
  block: number
  txHash: string
  explorerUrl: string | null
  kind: 'version' | 'deleted'
}

function entriesFrom(versions: VersionEntry[], deletion: RecordDetail['deletion']): Entry[] {
  const newestVersion = versions.length > 0 ? versions[versions.length - 1].version : null
  const list: Entry[] = [...versions].reverse().map((v) => ({
    key: `v${v.version}`,
    title: `Version ${v.version}`,
    tag: v.version === newestVersion && !deletion ? 'Current' : null,
    timestamp: v.timestamp,
    block: v.block,
    txHash: v.txHash,
    explorerUrl: v.explorerUrl,
    kind: 'version',
  }))
  if (deletion) {
    list.unshift({
      key: 'deleted',
      title: 'Deletion recorded',
      tag: null,
      timestamp: deletion.timestamp,
      block: deletion.block,
      txHash: deletion.txHash,
      explorerUrl: deletion.explorerUrl,
      kind: 'deleted',
    })
  }
  return list
}

/** What the chain remembers about one record, newest first, straight from its event log. */
export function VersionTimeline({ versions, deletion }: { versions: VersionEntry[]; deletion: RecordDetail['deletion'] }) {
  const titleId = useId()
  const entries = entriesFrom(versions, deletion)
  return (
    <section aria-labelledby={titleId} className={styles.timeline}>
      <h3 id={titleId} className={styles.title}>
        History on the chain
      </h3>
      <p className={styles.sub}>Every anchor is a permanent entry. Only the newest one counts.</p>
      {entries.length === 0 ? (
        <p className={styles.empty}>Nothing is anchored for this record yet.</p>
      ) : (
        <ol className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.key} className={cx(styles.item, entry.kind === 'deleted' && styles.deleted)}>
              <span className={styles.marker} aria-hidden="true" />
              <div className={styles.body}>
                <div className={styles.head}>
                  <strong>{entry.title}</strong>
                  {entry.tag && <span className={styles.tag}>{entry.tag}</span>}
                  <span className={styles.when}>{timeAgo(entry.timestamp)}</span>
                </div>
                <div className={cx(styles.meta, 'mono')}>block {formatBlock(entry.block)}</div>
                <div className={styles.tx}>
                  <span className="mono">{shortHash(entry.txHash, 8, 6)}</span>
                  <CopyButton value={entry.txHash} label={`Copy the transaction hash for ${entry.title}`} />
                  {entry.explorerUrl && (
                    <a className={styles.explorer} href={entry.explorerUrl} target="_blank" rel="noreferrer">
                      View on Etherscan <Icon name="external" size={12} />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
