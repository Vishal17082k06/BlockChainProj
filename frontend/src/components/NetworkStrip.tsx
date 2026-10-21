import type { CSSProperties } from 'react'
import { shortHash } from '../lib/format'
import type { NetworkInfo } from '../lib/types'
import { CopyButton } from './CopyButton'
import { Icon } from './icons'
import styles from './NetworkStrip.module.css'

const DESCRIPTION = {
  local: 'Development chain on this computer. A simulation: instant and free, but only you hold a copy.',
  sepolia: 'Public test network. Independent nodes keep copies, and anyone can check every transaction.',
} as const

/** A slim band under the header that says, in words and colour, which network is live. */
export function NetworkStrip({ network }: { network: NetworkInfo | undefined }) {
  if (!network || !network.ready) return null

  const contract = network.contracts.integrity
  const color = network.id === 'sepolia' ? 'var(--net-sepolia)' : 'var(--net-local)'
  return (
    <div className={styles.strip} data-network={network.id} style={{ '--net': color } as CSSProperties}>
      <span className={styles.name}>{network.label}</span>
      <span className={styles.text}>{DESCRIPTION[network.id]}</span>
      <span className={styles.meta}>
        <span className="mono">chain {network.chainId}</span>
        {contract && (
          <span className={styles.contract}>
            IntegrityRegistry <span className="mono">{shortHash(contract, 6, 4)}</span>
            <CopyButton value={contract} label="Copy contract address" />
            {network.explorer && (
              <a
                className={styles.iconButton}
                href={`${network.explorer}/address/${contract}`}
                target="_blank"
                rel="noreferrer"
                aria-label="View the contract on the block explorer"
              >
                <Icon name="external" size={13} />
              </a>
            )}
          </span>
        )}
      </span>
    </div>
  )
}
