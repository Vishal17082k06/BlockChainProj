import { useEffect, useRef, useState } from 'react'
import { usePulse } from '../hooks/queries'
import { cx } from '../lib/cx'
import { formatBlock, formatEth } from '../lib/format'
import type { NetworkInfo } from '../lib/types'
import styles from './ChainPulse.module.css'

/** The live block height, polled from the chain. It changes only when a REAL new block arrives, and the
 *  number briefly fades from the accent so a viewer can see the chain is alive. On Sepolia it also shows
 *  the wallet's balance, because every write spends from it. */
export function ChainPulse({ network }: { network: NetworkInfo | undefined }) {
  const ready = network?.ready ?? false
  const { data, isError } = usePulse(network?.id ?? 'local', ready)
  const previous = useRef<number | null>(null)
  const [flashes, setFlashes] = useState(0)

  useEffect(() => {
    if (data === undefined) return
    if (previous.current !== null && previous.current !== data.blockNumber) setFlashes((n) => n + 1)
    previous.current = data.blockNumber
  }, [data])

  const offline = !ready || isError
  return (
    <div className={styles.pulse}>
      <span className={styles.item} title={network ? `Latest block on ${network.label}` : undefined}>
        <span className={cx(styles.dot, offline && styles.off)} aria-hidden="true" />
        <span className={styles.label}>Block</span>
        <span key={flashes} className={cx(styles.value, 'mono', flashes > 0 && styles.flash)}>
          {offline ? '—' : formatBlock(data?.blockNumber ?? network?.blockNumber ?? null)}
        </span>
        <span className="sr-only">{offline ? 'chain offline' : 'chain live'}</span>
      </span>
      {network?.id === 'sepolia' && ready && (
        <span className={styles.item} title="Test ETH in the wallet that pays for writes">
          <span className={styles.label}>Wallet</span>
          <span className={cx(styles.value, 'mono')}>{formatEth(data?.balanceEth ?? network.balanceEth)} ETH</span>
        </span>
      )}
    </div>
  )
}
