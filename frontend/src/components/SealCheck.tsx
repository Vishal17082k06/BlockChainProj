import { useId, useMemo } from 'react'
import { chunk, diffHex, type Cell } from '../lib/diffHex'
import { cx } from '../lib/cx'
import styles from './SealCheck.module.css'

interface Props {
  /** The fingerprint the chain holds for this record, or null if it holds none. */
  chain: string | null
  /** The fingerprint computed from the database row right now, or null if the row is gone. */
  database: string | null
}

type Tone = 'ok' | 'bad' | 'warn' | 'neutral'

function describe(diff: ReturnType<typeof diffHex>, hasChain: boolean, hasDatabase: boolean): { text: string; tone: Tone } {
  if (hasChain && hasDatabase) {
    return diff.identical
      ? { text: `Identical. All ${diff.total} characters match.`, tone: 'ok' }
      : { text: `${diff.differing} of ${diff.total} characters differ.`, tone: 'bad' }
  }
  if (hasDatabase) {
    return { text: 'The chain holds no fingerprint for this record yet, so there is nothing to compare.', tone: 'neutral' }
  }
  if (hasChain) {
    return {
      text: 'The database row is gone, so there is nothing to compare. The chain still remembers the fingerprint above.',
      tone: 'warn',
    }
  }
  return { text: 'Nothing to compare.', tone: 'neutral' }
}

function Fingerprint({ label, hex, cells, emptyText }: { label: string; hex: string | null; cells: Cell[]; emptyText: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {cells.length > 0 ? (
        <div className={styles.hash} data-fingerprint>
          {/* The full value, readable by screen readers and selectable for copying. */}
          <span className="sr-only">{hex}</span>
          {chunk(cells, 8).map((group, gi) => (
            <span key={gi} className={styles.group} data-group aria-hidden="true">
              {group.map((cell, ci) => (
                <span key={ci} className={cx(styles.ch, cell.differs && styles.diff)} data-differs={cell.differs}>
                  {cell.c}
                </span>
              ))}
            </span>
          ))}
        </div>
      ) : (
        <div className={styles.absent}>{emptyText}</div>
      )}
    </div>
  )
}

/** The signature element: the two fingerprints aligned character for character.
 *  Matching characters stay quiet; differing ones light up. An untouched record shows two identical
 *  rows; a tampered one shows the avalanche effect (a tiny edit changes most of the fingerprint). */
export function SealCheck({ chain, database }: Props) {
  const titleId = useId()
  const diff = useMemo(() => diffHex(chain, database), [chain, database])
  const caption = describe(diff, chain !== null, database !== null)
  const state = diff.comparable ? (diff.identical ? 'ok' : 'bad') : 'open'

  return (
    <section className={styles.seal} aria-labelledby={titleId} data-state={state}>
      <h3 id={titleId} className={styles.title}>
        Seal check
      </h3>
      <p className={styles.sub}>Does the database still match what the chain remembers?</p>
      <Fingerprint label="Chain remembers" hex={chain} cells={diff.chain} emptyText="No fingerprint on the chain yet" />
      <Fingerprint label="Database now" hex={database} cells={diff.database} emptyText="No row in the database" />
      <p className={styles.caption} role="status" data-tone={caption.tone}>
        {caption.text}
      </p>
      {caption.tone === 'bad' && (
        <p className={styles.note}>Any edit, however small, changes most of a fingerprint.</p>
      )}
    </section>
  )
}
