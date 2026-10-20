import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NetworkSwitch } from './NetworkSwitch'
import type { NetworkInfo } from '../lib/types'

const info = (id: 'local' | 'sepolia', ready: boolean, reason: string | null = null): NetworkInfo => ({
  id,
  label: id,
  ready,
  reason,
  chainId: 1,
  blockNumber: 1,
  wallet: null,
  balanceEth: null,
  owner: null,
  contracts: { integrity: null, merkle: null },
  explorer: null,
})

describe('NetworkSwitch', () => {
  it('is a radio group with the current network checked', () => {
    render(<NetworkSwitch networks={[info('local', true), info('sepolia', true)]} loading={false} value="local" onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Network' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Local/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Sepolia/ })).not.toBeChecked()
  })

  it('switches to a ready network', async () => {
    const onChange = vi.fn()
    render(<NetworkSwitch networks={[info('local', true), info('sepolia', true)]} loading={false} value="local" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: /Sepolia/ }))
    expect(onChange).toHaveBeenCalledWith('sepolia')
  })

  it('refuses a network that is not ready and says why', async () => {
    const onChange = vi.fn()
    render(
      <NetworkSwitch
        networks={[info('local', true), info('sepolia', false, 'No wallet is configured')]}
        loading={false}
        value="local"
        onChange={onChange}
      />,
    )
    const sepolia = screen.getByRole('radio', { name: /Sepolia/ })
    await userEvent.click(sepolia)
    expect(onChange).not.toHaveBeenCalled()
    expect(sepolia).toHaveAccessibleDescription('No wallet is configured')
  })
})
