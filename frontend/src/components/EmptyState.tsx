import styles from './EmptyState.module.css'

export function EmptyState({ network }: { network: string }) {
  return (
    <div className={styles.empty}>
      <h3 className={styles.title}>No notes on {network} yet</h3>
      <p className={styles.lead}>Write one above and it will be anchored on the chain.</p>
      {/* A real sequence, so it is numbered: each step needs the one before it. */}
      <ol className={styles.steps}>
        <li>Save a note and watch each stage happen.</li>
        <li>
          Open the <strong>Attack lab</strong> and change the note behind the app&rsquo;s back.
        </li>
        <li>
          Choose <strong>Verify all</strong> and see the chain notice.
        </li>
      </ol>
    </div>
  )
}
