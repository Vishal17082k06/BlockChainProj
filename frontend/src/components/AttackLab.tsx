import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { cx } from '../lib/cx'
import type { AttackKind, AttackResult } from '../lib/types'
import { MAX_NOTE_LENGTH } from './Composer'
import { Icon } from './icons'
import styles from './AttackLab.module.css'

interface Props {
  open: boolean
  onClose: () => void
  noteId: number | null
  /** The note's text in the database right now, used to pre-fill the forgery. */
  currentText: string | null
  networkLabel: string
  /** Runs the attack against the database. Resolves with the server's account of what it did. */
  onRun: (kind: AttackKind, options: { content?: string; coverTracks: boolean }) => Promise<AttackResult>
  /** Checks every note against the chain, so the effect of an attack can be seen at once. */
  onVerify: () => void
}

const CHOICES: { kind: AttackKind; title: string; blurb: string }[] = [
  { kind: 'edit', title: 'Change the text', blurb: 'Rewrite the note straight in the database.' },
  { kind: 'delete', title: 'Delete the row', blurb: 'Remove the note without telling anyone.' },
  { kind: 'restore', title: 'Roll back', blurb: 'Put back an older text the chain once held.' },
]

const FOCUSABLE = 'button:not(:disabled), textarea, input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

/** A drawer that plays the attacker. It edits the database directly and never touches the chain,
 *  which is exactly what the chain is there to catch. Dark on purpose: a different actor. */
export function AttackLab({ open, onClose, noteId, currentText, networkLabel, onRun, onVerify }: Props) {
  const [kind, setKind] = useState<AttackKind>('edit')
  const [content, setContent] = useState('')
  const [coverTracks, setCoverTracks] = useState(false)
  const [running, setRunning] = useState(false)
  const [outcome, setOutcome] = useState<AttackResult | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  const runButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const textId = useId()

  // Each time the lab opens it starts clean for the chosen note, and gives focus back afterwards.
  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    setKind('edit')
    setContent(currentText ?? '')
    setCoverTracks(false)
    setOutcome(null)
    panel.current?.querySelector<HTMLElement>('input[type="radio"]:checked')?.focus()
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
    // Only when it opens or switches note: typing must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, noteId])

  // Escape closes the lab from anywhere. This listens on the document because a disabled button (while an
  // attack runs) hands focus to the page, where a handler on the dialog itself would never hear the key.
  useEffect(() => {
    if (!open) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || noteId === null) return null

  const keepFocusInside = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panel.current) return
    // Sorted into page order so first and last are right whichever order the selector list is matched in.
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const trimmed = content.trim()
  const invalid = kind === 'edit' && (trimmed.length === 0 || content.length > MAX_NOTE_LENGTH)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (running || invalid) return
    setRunning(true)
    setOutcome(null)
    try {
      setOutcome(await onRun(kind, { content: kind === 'edit' ? trimmed : undefined, coverTracks }))
    } catch (error) {
      setOutcome({ ok: false, detail: error instanceof Error ? error.message : 'The attack could not run.' })
    } finally {
      setRunning(false)
      // The button was disabled while running, which dropped focus; bring it back for keyboard users.
      window.setTimeout(() => runButton.current?.focus(), 0)
    }
  }

  return (
    <div className={styles.scrim} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panel}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={keepFocusInside}
      >
        <header className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Attack lab · {networkLabel}</p>
            <h2 id={titleId} className={styles.title}>
              Tamper with note <span className="mono">{noteId}</span>
            </h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close the Attack lab">
            <Icon name="close" size={16} />
          </button>
        </header>

        <p className={styles.lede}>
          You are now the attacker. These actions change the database directly and never tell the chain. Run one, then
          check the note: the chain should notice.
        </p>

        <form onSubmit={submit} className={styles.form}>
          <fieldset className={styles.choices}>
            <legend className="sr-only">What to do to the note</legend>
            {CHOICES.map((choice) => (
              <label key={choice.kind} className={cx(styles.choice, kind === choice.kind && styles.chosen)}>
                <input
                  type="radio"
                  name="attack-kind"
                  value={choice.kind}
                  checked={kind === choice.kind}
                  onChange={() => {
                    setKind(choice.kind)
                    setOutcome(null)
                  }}
                />
                <span className={styles.choiceTitle}>{choice.title}</span>
                <span className={styles.choiceBlurb}>{choice.blurb}</span>
              </label>
            ))}
          </fieldset>

          {kind === 'edit' && (
            <div className={styles.field}>
              <label htmlFor={textId}>The forged text</label>
              <textarea
                id={textId}
                value={content}
                rows={3}
                maxLength={MAX_NOTE_LENGTH}
                onChange={(event) => setContent(event.target.value)}
              />
            </div>
          )}

          <label className={styles.cover}>
            <input type="checkbox" checked={coverTracks} onChange={(event) => setCoverTracks(event.target.checked)} />
            <span>
              <strong>Cover the tracks</strong>
              <span className={styles.coverHint}>
                Also rewrite the local integrity log so it agrees with the lie. The chain still disagrees.
              </span>
            </span>
          </label>

          <button ref={runButton} type="submit" className={styles.run} disabled={running || invalid}>
            <Icon name="bolt" size={15} /> {running ? 'Running…' : 'Run the attack'}
          </button>
        </form>

        <div className={styles.result} aria-live="polite">
          {outcome && (
            <>
              <p className={cx(styles.detail, !outcome.ok && styles.failed)}>{outcome.detail}</p>
              {outcome.ok && (
                <button type="button" className={styles.verify} onClick={onVerify}>
                  <Icon name="scan" size={15} /> Check against the chain
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
