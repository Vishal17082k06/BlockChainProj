import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { api, writeStream } from './lib/api'
import type { NetworkInfo, RecordsResponse, StageEvent } from './lib/types'

vi.mock('./lib/api', async (original) => {
  const actual = await original<typeof import('./lib/api')>()
  return {
    ...actual,
    api: { networks: vi.fn(), pulse: vi.fn(), records: vi.fn(), record: vi.fn(), verifyAll: vi.fn(), attack: vi.fn() },
    writeStream: vi.fn(),
  }
})

const network = (id: 'local' | 'sepolia', ready = true): NetworkInfo => ({
  id,
  label: id === 'local' ? 'Local chain' : 'Sepolia',
  ready,
  reason: ready ? null : 'No wallet is configured',
  chainId: id === 'local' ? 31337 : 11155111,
  blockNumber: 5,
  wallet: '0xabc',
  balanceEth: '1.0',
  owner: '0xabc',
  contracts: { integrity: '0x5FbDB2315678afecb367f032d93F642f64180aa3', merkle: null },
  explorer: id === 'sepolia' ? 'https://sepolia.etherscan.io' : null,
})

const row = (id: number, content: string) => ({
  id, content, status: 'VERIFIED' as const, version: 1, anchoredAt: 1, inDatabase: true,
})
const ledger = (...rows: ReturnType<typeof row>[]): RecordsResponse => ({ summary: { VERIFIED: rows.length }, records: rows })

function stages(noteId: number): StageEvent[] {
  return [
    { t: 1, stage: 'saved', noteId },
    { t: 2, stage: 'fingerprint', hash: 'ab'.repeat(32) },
    { t: 3, stage: 'sent', txHash: '0xfeed', explorerUrl: null },
    { t: 4, stage: 'mined', block: 6, gasUsed: 98706, feeWei: '1', feeEth: '0.00006', version: 1 },
    { t: 5, stage: 'done', noteId },
  ]
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(api.networks).mockResolvedValue([network('local'), network('sepolia')])
  vi.mocked(api.pulse).mockResolvedValue({ blockNumber: 5, balanceEth: '1.0' })
  vi.mocked(api.records).mockImplementation(async (net) =>
    net === 'local' ? ledger(row(1, 'Local note one')) : ledger(),
  )
  vi.mocked(writeStream).mockImplementation(async function* () {
    for (const event of stages(2)) yield event
  })
})

describe('App', () => {
  it('shows the notes of the chosen network', async () => {
    mount()
    expect(await screen.findByText('Local note one')).toBeInTheDocument()
  })

  it('opens the inspector for a clicked note', async () => {
    const user = userEvent.setup()
    vi.mocked(api.record).mockResolvedValue({
      id: 1, status: 'VERIFIED', row: { content: 'Local note one' },
      fingerprint: { database: 'a'.repeat(64), chain: 'a'.repeat(64), matches: true },
      deleted: false, versions: [], deletion: null,
    })
    mount()
    await user.click(await screen.findByText('Local note one'))
    expect(await screen.findByRole('heading', { name: 'Note 1' })).toBeInTheDocument()
    expect(await screen.findByText(/Identical\. All 64 characters match\./)).toBeInTheDocument()
  })

  it('does not carry a finished write from one network into another', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('Local note one')
    await user.type(screen.getByLabelText('New note'), 'A second note')
    await user.click(screen.getByRole('button', { name: 'Save and anchor' }))
    const progress = await screen.findByLabelText('Write progress')
    expect(within(progress).getByText(/on Local chain/)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Sepolia/ }))
    await waitFor(() => expect(screen.getByLabelText('New note')).toHaveAttribute('placeholder', expect.stringContaining('Sepolia')))
    expect(screen.queryByLabelText('Write progress')).not.toBeInTheDocument()
    expect(screen.queryByText('Local note one')).not.toBeInTheDocument()
  })

  it('does not carry a verify-all result or a selection into another network', async () => {
    const user = userEvent.setup()
    vi.mocked(api.verifyAll).mockResolvedValue({ summary: { VERIFIED: 1 }, results: [row(1, 'Local note one')] })
    vi.mocked(api.record).mockResolvedValue({
      id: 1, status: 'VERIFIED', row: { content: 'Local note one' },
      fingerprint: { database: 'a'.repeat(64), chain: 'a'.repeat(64), matches: true },
      deleted: false, versions: [], deletion: null,
    })
    mount()
    await user.click(await screen.findByText('Local note one'))
    await user.click(screen.getByRole('button', { name: /verify all/i }))
    expect(await screen.findByText(/Checked just now in/)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Sepolia/ }))
    await waitFor(() => expect(screen.queryByText('Local note one')).not.toBeInTheDocument())
    expect(screen.queryByText(/Checked just now/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Note 1' })).not.toBeInTheDocument()
  })

  it('keeps the activity tape across networks, labelled with where each line happened', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('Local note one')
    await user.type(screen.getByLabelText('New note'), 'Another')
    await user.click(screen.getByRole('button', { name: 'Save and anchor' }))
    await screen.findByLabelText('Write progress')
    await user.click(screen.getByRole('radio', { name: /Sepolia/ }))
    await user.click(screen.getByRole('button', { name: /activity/i }))
    expect(await screen.findByText(/Mined in block 6/)).toBeInTheDocument()
    expect(screen.getAllByText('Local').length).toBeGreaterThan(0)
  })

  it('explains an unavailable network instead of showing an empty ledger', async () => {
    vi.mocked(api.networks).mockResolvedValue([network('local', false), network('sepolia')])
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent(/not available/i)
    expect(screen.getByRole('alert')).toHaveTextContent('No wallet is configured')
  })

  it('remembers the chosen network for next time', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('Local note one')
    await user.click(screen.getByRole('radio', { name: /Sepolia/ }))
    expect(localStorage.getItem('witness.network')).toBe('sepolia')
  })
})
