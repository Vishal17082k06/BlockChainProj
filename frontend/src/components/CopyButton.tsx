import { useState } from 'react'
import { Icon } from './icons'
import styles from './CopyButton.module.css'

/** Copies a value and says so (visibly for a moment, and to screen readers). */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be blocked by the browser; the value is still on screen to select.
    }
  }

  return (
    <button type="button" className={styles.button} onClick={copy} aria-label={label} data-copied={copied}>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      <span className="sr-only" role="status">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  )
}
