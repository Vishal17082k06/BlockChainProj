import { useId, useState, type FormEvent } from 'react'
import { cx } from '../lib/cx'
import { statusMeta } from '../lib/statusMeta'
import type { RecordDetail, RecordRow } from '../lib/types'
import { MAX_NOTE_LENGTH } from './Composer'
import { ErrorNotice } from './ErrorNotice'
import { Icon } from './icons'
import { SealCheck } from './SealCheck'
import { StatusStamp } from './StatusStamp'
import { VersionTimeline } from './VersionTimeline'
import styles from './Inspector.module.css'

interface Props {
  selectedId: number | null
  /** The row from the ledger, shown while the full detail loads. */
  record: RecordRow | undefined
  detail: RecordDetail | undefined
  loading: boolean
  error: Error | null
  onRetry: () => void
  /** True while a write is running: edit and delete stay visible but cannot start. */
  busy: boolean
  onEdit: (text: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onOpenAttack: () => void
  /** Closes the panel (used on narrow screens, where it slides over the ledger). */
  onClose: () => void
}

export function Inspector(props: Props) {
  const { selectedId, record, detail, loading, error, onRetry, busy, onEdit, onDelete, onOpenAttack, onClose } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editId = useId()

  if (selectedId === null) {
    return (
      <div className={cx(styles.panel, styles.placeholder)}>
        <h2 className={styles.placeholderTitle}>Inspector</h2>
        <p>Select a note to compare its fingerprint with what the chain remembers.</p>
        <div className={styles.ghostSeal} aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    )
  }

  const status = detail?.status ?? record?.status
  const content = detail ? detail.row?.content ?? null : record?.content ?? null
  const hasRow = detail ? detail.row !== null : (record?.inDatabase ?? false)
  const removed = detail?.deleted ?? false
  const canChange = hasRow && !removed

  const startEdit = () => {
    setDraft(content ?? '')
    setConfirmDelete(false)
    setEditing(true)
  }

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || text.length > MAX_NOTE_LENGTH || busy) return
    setEditing(false)
    await onEdit(text)
  }

  const confirmRemoval = async () => {
    setConfirmDelete(false)
    await onDelete()
  }

  return (
    <div className={styles.panel}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <h2 className={cx(styles.id, 'mono')}>Note {selectedId}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close the inspector">
            <Icon name="close" size={16} />
          </button>
        </div>
        {status && <StatusStamp status={status} size="lg" />}
        {status && <p className={styles.explain}>{statusMeta[status].explain}</p>}
      </header>

      {error ? (
        <ErrorNotice title="Could not load this note" message={error.message} onRetry={onRetry} />
      ) : (
        <>
          <section className={styles.noteCard} aria-label="Note text in the database">
            <span className={styles.cardLabel}>In the database now</span>
            {editing ? (
              <form className={styles.editForm} onSubmit={submitEdit}>
                <label htmlFor={editId} className="sr-only">
                  New text for note {selectedId}
                </label>
                <textarea
                  id={editId}
                  className={styles.textarea}
                  value={draft}
                  rows={3}
                  maxLength={MAX_NOTE_LENGTH}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className={styles.editActions}>
                  <button type="submit" className={styles.primary} disabled={busy || draft.trim().length === 0}>
                    <Icon name="anchor" size={15} /> Re-anchor
                  </button>
                  <button type="button" className={styles.ghost} onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : content !== null ? (
              <p className={styles.noteText}>{content}</p>
            ) : (
              <p className={styles.noteGone}>
                {removed ? 'The row was deleted, so there is no text to show.' : 'This row is no longer in the database.'}
              </p>
            )}
          </section>

          {loading && !detail ? (
            <div className={styles.skeleton} aria-busy="true" aria-label="Loading the comparison" />
          ) : (
            <>
              <SealCheck chain={detail?.fingerprint.chain ?? null} database={detail?.fingerprint.database ?? null} />
              <VersionTimeline versions={detail?.versions ?? []} deletion={detail?.deletion ?? null} />
            </>
          )}

          <footer className={styles.actions}>
            {confirmDelete ? (
              <div className={styles.confirm} role="group" aria-label="Confirm deletion">
                <span>Delete note {selectedId} and record the deletion on the chain?</span>
                <div className={styles.confirmButtons}>
                  <button type="button" className={styles.danger} onClick={confirmRemoval} disabled={busy}>
                    Delete and record it
                  </button>
                  <button type="button" className={styles.ghost} onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={startEdit}
                  disabled={!canChange || busy || editing}
                  title={busy ? 'A write is still running' : !canChange ? 'There is no row to edit' : undefined}
                >
                  <Icon name="edit" size={15} /> Edit and re-anchor
                </button>
                <button
                  type="button"
                  className={styles.dangerOutline}
                  onClick={() => setConfirmDelete(true)}
                  disabled={!canChange || busy}
                  title={busy ? 'A write is still running' : !canChange ? 'There is no row to delete' : undefined}
                >
                  <Icon name="removed" size={15} /> Delete and record it
                </button>
                <button
                  type="button"
                  className={styles.attack}
                  onClick={onOpenAttack}
                  disabled={!canChange}
                  title={!canChange ? 'There is no row to attack' : undefined}
                >
                  <Icon name="bolt" size={15} /> Attack lab
                </button>
              </>
            )}
          </footer>
        </>
      )}
    </div>
  )
}
