import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChainPulse } from './ChainPulse'
import { api } from '../lib/api'
import type { NetworkInfo } from '../lib/types'

vi.mock('../lib/api', async (original) => {
  const actual = await original<typeof import('../lib/api')>()
  return { ...actual, api: { ...actual.api, pulse: vi.fn() } }
})

const info = (id: 'local' | 'sepolia', ready = true): NetworkInfo => ({
  id, label: id, ready, reason: null, chainId: 1, blockNumber: 7, wallet: null, balanceEth: '0.5',
  owner: null, contracts: { integrity: null, merkle: null }, explorer: null,
})

const show = (network: NetworkInfo | undefined) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChainPulse network={network} />
    </QueryClientProvider>,
  )

const live = () => vi.mocked(api.pulse).mockResolvedValue({ blockNumber: 12345, balanceEth: '0.033379' })

describe('ChainPulse', () => {
  it('shows the live block number with thousands separators', async () => {
    live()
    show(info('local'))
    expect(await screen.findByText('12,345')).toBeInTheDocument()
    expect(screen.getByText('chain live')).toBeInTheDocument()
  })

  it('shows the wallet balance on Sepolia only', async () => {
    live()
    const { unmount } = show(info('sepolia'))
    expect(await screen.findByText(/0\.033379 ETH/)).toBeInTheDocument()
    unmount()
    show(info('local'))
    await screen.findByText('12,345')
    expect(screen.queryByText(/ETH/)).not.toBeInTheDocument()
  })

  it('reads as offline, with a dash, when the network is not ready', () => {
    vi.mocked(api.pulse).mockClear()
    show(info('local', false))
    expect(screen.getByText('chain offline')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(api.pulse).not.toHaveBeenCalled()
  })

  it('reads as offline when the pulse request fails', async () => {
    vi.mocked(api.pulse).mockImplementation(async () => {
      throw new Error('down')
    })
    show(info('local'))
    expect(await screen.findByText('chain offline')).toBeInTheDocument()
  })
})
