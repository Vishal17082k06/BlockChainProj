import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Inspector } from './Inspector'
import type { RecordDetail, RecordRow } from '../lib/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

const detail = (over: Partial<RecordDetail> = {}): RecordDetail => ({
  id: 4,
  status: 'VERIFIED',
  row: { content: 'Current text' },
  fingerprint: { database: A, chain: A, matches: true },
  deleted: false,
  versions: [
    { version: 1, hash: B, timestamp: 100, txHash: '0x' + '1'.repeat(64), block: 3, explorerUrl: null },
    {
      version: 2,
      hash: A,
      timestamp: 200,
      txHash: '0x' + '2'.repeat(64),
      block: 5,
      explorerUrl: 'https://sepolia.etherscan.io/tx/0x2',
    },
  ],
  deletion: null,
  ...over,
})

const base = {
  selectedId: 4,
  record: undefined as RecordRow | undefined,
  detail: detail(),
  loading: false,
  error: null,
  onRetry: () => {},
  busy: false,
  onEdit: vi.fn().mockResolvedValue(true),
  onDelete: vi.fn().mockResolvedValue(true),
  onOpenAttack: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe('Inspector', () => {
  it('invites a selection when nothing is chosen', () => {
    render(<Inspector {...base} selectedId={null} detail={undefined} />)
    expect(screen.getByText(/select a note/i)).toBeInTheDocument()
  })

  it('explains the status and shows the note text', () => {
    render(<Inspector {...base} />)
    expect(screen.getByRole('heading', { name: 'Note 4' })).toBeInTheDocument()
    expect(screen.getByText('Current text')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
  })

  it('lists the chain history newest first and marks only the newest as current', () => {
    render(<Inspector {...base} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Version 2')
    expect(items[0]).toHaveTextContent('Current')
    expect(items[1]).toHaveTextContent('Version 1')
    expect(items[1]).not.toHaveTextContent('Current')
  })

  it('links a transaction to the block explorer only when there is one', () => {
    render(<Inspector {...base} />)
    expect(screen.getAllByRole('link', { name: /view on etherscan/i })).toHaveLength(1)
  })

  it('edits through the app with the new text', async () => {
    const user = userEvent.setup()
    render(<Inspector {...base} />)
    await user.click(screen.getByRole('button', { name: 'Edit and re-anchor' }))
    const box = screen.getByLabelText('New text for note 4')
    expect(box).toHaveValue('Current text')
    await user.clear(box)
    await user.type(box, 'Edited')
    await user.click(screen.getByRole('button', { name: 'Re-anchor' }))
    expect(base.onEdit).toHaveBeenCalledWith('Edited')
  })

  it('asks before deleting, and does nothing if the person backs out', async () => {
    const user = userEvent.setup()
    render(<Inspector {...base} />)
    await user.click(screen.getByRole('button', { name: 'Delete and record it' }))
    expect(base.onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'Confirm deletion' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(base.onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Confirm deletion' })).not.toBeInTheDocument()
  })

  it('deletes after confirmation', async () => {
    const user = userEvent.setup()
    render(<Inspector {...base} />)
    await user.click(screen.getByRole('button', { name: 'Delete and record it' }))
    const confirm = screen.getByRole('group', { name: 'Confirm deletion' })
    await user.click(within(confirm).getByRole('button', { name: 'Delete and record it' }))
    expect(base.onDelete).toHaveBeenCalledTimes(1)
  })

  it('disables edit and delete while a write is running, with a reason', () => {
    render(<Inspector {...base} busy />)
    const edit = screen.getByRole('button', { name: 'Edit and re-anchor' })
    expect(edit).toBeDisabled()
    expect(edit).toHaveAttribute('title', 'A write is still running')
    expect(screen.getByRole('button', { name: 'Delete and record it' })).toBeDisabled()
  })

  it('offers no changes for a row that is gone, but still shows its history', () => {
    render(
      <Inspector
        {...base}
        detail={detail({ status: 'MISSING_FROM_DB', row: null, fingerprint: { database: null, chain: A, matches: false } })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Edit and re-anchor' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete and record it' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Attack lab' })).toBeDisabled()
    expect(screen.getByText(/no longer in the database/i)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows a recorded deletion at the top of the history', () => {
    render(
      <Inspector
        {...base}
        detail={detail({
          status: 'DELETED_AUTHORIZED',
          row: null,
          deleted: true,
          deletion: { txHash: '0x' + '9'.repeat(64), block: 8, timestamp: 300, explorerUrl: null },
        })}
      />,
    )
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Deletion recorded')
    expect(screen.getByText(/the row was deleted/i)).toBeInTheDocument()
  })

  it('opens the Attack lab', async () => {
    render(<Inspector {...base} />)
    await userEvent.click(screen.getByRole('button', { name: 'Attack lab' }))
    expect(base.onOpenAttack).toHaveBeenCalled()
  })

  it('explains a load failure and lets the person retry', async () => {
    const onRetry = vi.fn()
    render(<Inspector {...base} detail={undefined} error={new Error('Chain is down')} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Chain is down')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
