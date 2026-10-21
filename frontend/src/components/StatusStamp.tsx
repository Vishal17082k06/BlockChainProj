import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cx } from '../lib/cx'
import { statusMeta } from '../lib/statusMeta'
import type { Status } from '../lib/types'
import { Icon } from './icons'
import styles from './StatusStamp.module.css'

interface Props {
  status: Status
  size?: 'md' | 'lg'
}

/** A record's status as a stamp: icon + word + colour, so colour is never the only signal.
 *  When the status CHANGES (not on first paint) it briefly presses in, so the flip is noticed. */
export function StatusStamp({ status, size = 'md' }: Props) {
  const meta = statusMeta[status]
  const previous = useRef<Status>(status)
  const [flips, setFlips] = useState(0)

  useEffect(() => {
    if (previous.current !== status) {
      previous.current = status
      setFlips((n) => n + 1)
    }
  }, [status])

  return (
    <span
      key={flips}
      className={cx(styles.stamp, size === 'lg' && styles.lg, flips > 0 && styles.flip)}
      data-status={status}
      data-tone={meta.tone}
      style={{ '--c': meta.color, '--bg': meta.bg } as CSSProperties}
    >
      <Icon name={meta.icon} size={size === 'lg' ? 18 : 14} />
      {meta.label}
    </span>
  )
}
