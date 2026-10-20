import type { FailureCode } from '../lib/types'
import { cx } from '../lib/cx'
import { formatBlock, formatElapsed, formatEth, formatGas, shortHash } from '../lib/format'
import type { RunState, StepId } from '../lib/stageReducer'
import { useLiveElapsed } from '../hooks/useLiveElapsed'
import { Icon } from './icons'
import styles from './StageStepper.module.css'

const STEP_LABEL: Record<StepId, string> = {
  saved: 'Saved to database',
  fingerprint: 'Fingerprint made',
  sent: 'Transaction sent',
  mined: 'Mined in a block',
  removed: 'Removed from database',
}

const FAILURE_TITLE: Record<FailureCode, string> = {
  REFUSED: 'Edit refused',
  CHAIN_UNAVAILABLE: 'Chain unreachable',
  WRONG_NETWORK: 'Wrong network',
  LOW_BALANCE: 'Wallet balance too low',
  TX_FAILED: 'Transaction failed',
  INTERNAL: 'Unexpected error',
  INVALID: 'Invalid input',
  BUSY: 'Another write is running',
}

const VERB = { create: 'Anchoring', edit: 'Re-anchoring', delete: 'Recording the deletion' } as const

interface Props {
  run: RunState
  /** The network's display name, e.g. "Sepolia". */
  network: string
  onDismiss?: () => void
}

/** The live progress of one write. Every stage lights up only when the API reports that stage
 *  really happened; nothing here is simulated. */
export function StageStepper({ run, network, onDismiss }: Props) {
  const running = run.phase === 'running'
  const elapsed = useLiveElapsed(running, run.elapsedMs)
  if (run.phase === 'idle' || run.kind === null) return null

  const subject = run.noteId !== null ? `Note ${run.noteId}` : 'New note'
  const activeIndex = run.steps.findIndex((s) => s.status === 'active')
  const live = running
    ? `Step ${activeIndex + 1} of ${run.steps.length}: ${STEP_LABEL[run.steps[activeIndex]?.id ?? 'saved']}`
    : run.phase === 'done'
      ? 'Finished'
      : 'Failed'

  const detail = (id: StepId): string | null => {
    if (id === 'fingerprint' && run.fingerprint) return shortHash(run.fingerprint, 8, 0)
    if (id === 'sent' && run.txHash) return shortHash(run.txHash)
    if (id === 'mined' && run.block !== null) return `block ${formatBlock(run.block)}`
    return null
  }

  return (
    <section className={styles.card} data-phase={run.phase} aria-label="Write progress">
      <header className={styles.head}>
        <h3 className={styles.title}>
          <span className={styles.subject}>{subject}</span>
          <span className={styles.verb}>
            {VERB[run.kind]} on {network}
          </span>
        </h3>
        <span className={cx(styles.clock, 'mono')}>{formatElapsed(elapsed)}</span>
      </header>

      <ol className={styles.steps}>
        {run.steps.map((step) => (
          <li
            key={step.id}
            className={styles.step}
            data-step-status={step.status}
            aria-current={step.status === 'active' ? 'step' : undefined}
          >
            <span className={styles.node}>
              {step.status === 'done' && <Icon name="check" size={13} />}
              {step.status === 'failed' && <Icon name="close" size={13} />}
            </span>
            <span className={styles.label}>{STEP_LABEL[step.id]}</span>
            <span className={cx(styles.detail, 'mono')}>{detail(step.id) ?? ' '}</span>
          </li>
        ))}
      </ol>

      <div className={styles.foot}>
        {running && (
          <p className={styles.line}>
            {run.txHash ? (
              <>
                Transaction{' '}
                {run.explorerUrl ? (
                  <a className={cx(styles.link, 'mono')} href={run.explorerUrl} target="_blank" rel="noreferrer">
                    {shortHash(run.txHash)} <Icon name="external" size={12} />
                  </a>
                ) : (
                  <span className="mono">{shortHash(run.txHash)}</span>
                )}{' '}
                sent. Waiting for the network to mine it…
              </>
            ) : (
              'Working…'
            )}
          </p>
        )}

        {run.phase === 'done' && (
          <p className={styles.line} data-testid="run-summary">
            {run.block !== null ? (
              <>
                {run.kind === 'delete' ? 'Deletion recorded' : `Anchored as version ${run.version ?? '?'}`} in block{' '}
                {formatBlock(run.block)} · {formatGas(run.gasUsed)} gas · {formatEth(run.feeEth)} ETH
              </>
            ) : (
              'Done.'
            )}
            {run.txHash && (
              <>
                {' · '}
                {run.explorerUrl ? (
                  <a className={cx(styles.link, 'mono')} href={run.explorerUrl} target="_blank" rel="noreferrer">
                    {shortHash(run.txHash)} <Icon name="external" size={12} />
                  </a>
                ) : (
                  <span className="mono">{shortHash(run.txHash)}</span>
                )}
              </>
            )}
          </p>
        )}

        {run.phase === 'failed' && run.failure && (
          <div className={styles.failure} role="alert">
            <strong>{FAILURE_TITLE[run.failure.code]}</strong>
            <span>{run.failure.message}</span>
          </div>
        )}

        {run.phase !== 'running' && onDismiss && (
          <button type="button" className={styles.dismiss} onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>

      <span className="sr-only" role="status" aria-live="polite" data-testid="run-live">
        {live}
      </span>
    </section>
  )
}
