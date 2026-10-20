import type { NetworkId, NetworkInfo } from '../lib/types'
import { ChainPulse } from './ChainPulse'
import { NetworkSwitch } from './NetworkSwitch'
import styles from './Header.module.css'

/** The Witness mark: a grid of fingerprint cells with one cell that differs. */
function Mark() {
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  return (
    <svg className={styles.mark} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="currentColor" />
      {cells.map((i) => {
        const x = 6 + (i % 3) * 7.5
        const y = 6 + Math.floor(i / 3) * 7.5
        return <rect key={i} x={x} y={y} width="5" height="5" rx="1" fill={i === 4 ? '#ff6a3d' : 'var(--paper)'} />
      })}
    </svg>
  )
}

interface Props {
  networks: NetworkInfo[] | undefined
  loading: boolean
  value: NetworkId
  onChange: (id: NetworkId) => void
}

export function Header({ networks, loading, value, onChange }: Props) {
  const current = networks?.find((n) => n.id === value)
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Mark />
        <span className={styles.name}>Witness</span>
        <span className={styles.tagline}>record integrity console</span>
      </div>
      <div className={styles.controls}>
        <ChainPulse network={current} />
        <NetworkSwitch networks={networks} loading={loading} value={value} onChange={onChange} />
      </div>
    </header>
  )
}
