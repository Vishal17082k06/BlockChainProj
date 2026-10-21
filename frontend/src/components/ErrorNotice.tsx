import styles from './ErrorNotice.module.css'

interface Props {
  title: string
  message: string
  onRetry?: () => void
}

/** A failure explained: what happened, and what to do. Errors do not apologise. */
export function ErrorNotice({ title, message, onRetry }: Props) {
  return (
    <div className={styles.notice} role="alert">
      <div className={styles.text}>
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
