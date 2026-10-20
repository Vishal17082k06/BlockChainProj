import { useId, useState, type FormEvent } from 'react'
import { cx } from '../lib/cx'
import { Icon } from './icons'
import styles from './Composer.module.css'

export const MAX_NOTE_LENGTH = 500

interface Props {
  /** True while a write is running: the form stays visible but cannot submit. */
  disabled: boolean
  networkLabel: string
  /** Resolves true when the note was saved, so the field can clear. */
  onSubmit: (text: string) => Promise<boolean>
}

export function Composer({ disabled, networkLabel, onSubmit }: Props) {
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const inputId = useId()
  const hintId = useId()

  const trimmed = text.trim()
  const invalid = trimmed.length === 0 || text.length > MAX_NOTE_LENGTH

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (invalid || disabled) return
    if (await onSubmit(trimmed)) {
      setText('')
      setTouched(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor={inputId}>
        New note
      </label>
      <div className={styles.field}>
        <input
          id={inputId}
          className={styles.input}
          value={text}
          maxLength={MAX_NOTE_LENGTH}
          autoComplete="off"
          placeholder={`Write a note. It will be anchored on ${networkLabel}.`}
          aria-invalid={touched && invalid ? true : undefined}
          aria-describedby={touched && invalid ? hintId : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        {text.length > 0 && (
          <span className={cx(styles.count, 'mono')} aria-hidden="true">
            {text.length}/{MAX_NOTE_LENGTH}
          </span>
        )}
      </div>
      <button
        type="submit"
        className={styles.button}
        disabled={disabled}
        title={disabled ? 'A write is still running' : undefined}
      >
        <Icon name="anchor" size={16} />
        Save and anchor
      </button>
      {touched && invalid && (
        <p id={hintId} className={styles.hint} role="alert">
          Write between 1 and {MAX_NOTE_LENGTH} characters.
        </p>
      )}
    </form>
  )
}
