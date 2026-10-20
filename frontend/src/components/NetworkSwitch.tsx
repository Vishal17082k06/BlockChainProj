import { useId, type CSSProperties } from 'react'
import { cx } from '../lib/cx'
import type { NetworkId, NetworkInfo } from '../lib/types'
import styles from './NetworkSwitch.module.css'

const SEGMENTS: { id: NetworkId; label: string; color: string }[] = [
  { id: 'local', label: 'Local', color: 'var(--net-local)' },
  { id: 'sepolia', label: 'Sepolia', color: 'var(--net-sepolia)' },
]

interface Props {
  networks: NetworkInfo[] | undefined
  loading: boolean
  value: NetworkId
  onChange: (id: NetworkId) => void
}

/** Chooses the blockchain the console talks to. A network that cannot be used right now stays visible
 *  but cannot be chosen, and says why. */
export function NetworkSwitch({ networks, loading, value, onChange }: Props) {
  const baseId = useId()
  return (
    <div className={styles.switch} role="radiogroup" aria-label="Network">
      {SEGMENTS.map((segment) => {
        const info = networks?.find((n) => n.id === segment.id)
        const ready = info?.ready ?? false
        const selected = value === segment.id
        const blocked = !ready && !selected
        const reasonId = `${baseId}-${segment.id}`
        const reason = loading ? 'Checking…' : info?.reason ?? 'Not available'
        return (
          <button
            key={segment.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={blocked || undefined}
            aria-describedby={!ready ? reasonId : undefined}
            className={cx(styles.segment, selected && styles.selected, blocked && styles.blocked)}
            style={{ '--dot': segment.color } as CSSProperties}
            onClick={() => {
              if (!blocked) onChange(segment.id)
            }}
          >
            <span className={styles.dot} aria-hidden="true" />
            {segment.label}
            {!ready && (
              <span id={reasonId} className={styles.reason} role="tooltip">
                {reason}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
