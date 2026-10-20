import { render, screen } from '@testing-library/react'
import { StageStepper } from './StageStepper'
import { initialRun, runReducer, type RunState } from '../lib/stageReducer'
import type { StageEvent } from '../lib/types'

const feed = (state: RunState, ...events: StageEvent[]) =>
  events.reduce((s, event) => runReducer(s, { type: 'event', event }), state)

const started = (kind: 'create' | 'edit' | 'delete', noteId?: number) =>
  runReducer(initialRun, { type: 'start', kind, noteId })

describe('StageStepper', () => {
  it('shows the real stages of a create, with the first one current', () => {
    render(<StageStepper run={started('create')} network="Local chain" />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Saved to database'),
      expect.stringContaining('Fingerprint made'),
      expect.stringContaining('Transaction sent'),
      expect.stringContaining('Mined in a block'),
    ])
    expect(items[0]).toHaveAttribute('aria-current', 'step')
    expect(items[1]).not.toHaveAttribute('aria-current')
  })

  it('an edit has no save step, a delete ends with removal', () => {
    const { rerender } = render(<StageStepper run={started('edit', 4)} network="Local chain" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    rerender(<StageStepper run={started('delete', 4)} network="Local chain" />)
    expect(screen.getAllByRole('listitem').at(-1)).toHaveTextContent('Removed from database')
  })

  it('names the note and the network in its title', () => {
    render(<StageStepper run={started('edit', 7)} network="Sepolia" />)
    expect(screen.getByRole('heading')).toHaveTextContent('Note 7')
    expect(screen.getByRole('heading')).toHaveTextContent('Sepolia')
  })

  it('shows the transaction hash as a link while it waits to be mined', () => {
    const run = feed(
      started('create'),
      { t: 5, stage: 'saved', noteId: 3 },
      { t: 9, stage: 'fingerprint', hash: 'ab'.repeat(32) },
      { t: 20, stage: 'sent', txHash: '0x69acef310151fcb7568e6869671c97b42ab43d89c83e5740abe99c6271376a43', explorerUrl: 'https://sepolia.etherscan.io/tx/0x69ac' },
    )
    render(<StageStepper run={run} network="Sepolia" />)
    const link = screen.getByRole('link', { name: /0x69ac…6a43/ })
    expect(link).toHaveAttribute('href', 'https://sepolia.etherscan.io/tx/0x69ac')
    expect(screen.getByText(/waiting for the network/i)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[3]).toHaveAttribute('aria-current', 'step')
  })

  it('summarises a finished anchor with the real block, gas and fee', () => {
    const run = feed(
      started('create'),
      { t: 5, stage: 'saved', noteId: 3 },
      { t: 6, stage: 'fingerprint', hash: 'ab'.repeat(32) },
      { t: 7, stage: 'sent', txHash: '0xfeed', explorerUrl: null },
      { t: 12, stage: 'mined', block: 11953418, gasUsed: 6695317, feeWei: '1', feeEth: '0.010042975', version: 1 },
      { t: 13, stage: 'done', noteId: 3 },
    )
    render(<StageStepper run={run} network="Sepolia" />)
    const summary = screen.getByTestId('run-summary')
    expect(summary).toHaveTextContent('version 1')
    expect(summary).toHaveTextContent('block 11,953,418')
    expect(summary).toHaveTextContent('6,695,317 gas')
    expect(summary).toHaveTextContent('0.010042975 ETH')
  })

  it('shows a refusal plainly, in an alert, and marks the failed step', () => {
    const run = feed(started('edit', 2), {
      t: 3,
      stage: 'failed',
      code: 'REFUSED',
      message: 'Update refused: record status is TAMPERED. The edit was not applied.',
    })
    render(<StageStepper run={run} network="Local chain" />)
    expect(screen.getByRole('alert')).toHaveTextContent('The edit was not applied.')
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('data-step-status', 'failed')
  })

  it('announces the current stage to screen readers', () => {
    render(<StageStepper run={started('create')} network="Local chain" />)
    expect(screen.getByTestId('run-live')).toHaveTextContent('Step 1 of 4: Saved to database')
  })

  it('offers to dismiss a finished run', () => {
    const run = feed(started('delete', 1), { t: 1, stage: 'done', noteId: 1 })
    const onDismiss = vi.fn()
    render(<StageStepper run={run} network="Local chain" onDismiss={onDismiss} />)
    screen.getByRole('button', { name: /dismiss/i }).click()
    expect(onDismiss).toHaveBeenCalled()
  })
})
