import { render, screen } from '@testing-library/react'
import { StatusStamp } from './StatusStamp'
import { statusMeta } from '../lib/statusMeta'
import type { Status } from '../lib/types'

const ALL = Object.keys(statusMeta) as Status[]

describe('StatusStamp', () => {
  it.each(ALL)('%s is shown as a word AND an icon, never colour alone', (status) => {
    const { container } = render(<StatusStamp status={status} />)
    expect(screen.getByText(statusMeta[status].label)).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('carries its status for styling and tests', () => {
    const { container } = render(<StatusStamp status="TAMPERED" />)
    expect(container.firstElementChild).toHaveAttribute('data-status', 'TAMPERED')
  })

  it('does not animate on first paint', () => {
    const { container } = render(<StatusStamp status="VERIFIED" />)
    expect(container.firstElementChild?.className).not.toMatch(/flip/)
  })

  it('animates when the status changes, so the change is noticed', () => {
    const { container, rerender } = render(<StatusStamp status="VERIFIED" />)
    rerender(<StatusStamp status="TAMPERED" />)
    expect(container.firstElementChild?.className).toMatch(/flip/)
    expect(container.firstElementChild).toHaveAttribute('data-status', 'TAMPERED')
  })

  it('does not animate when re-rendered with the same status', () => {
    const { container, rerender } = render(<StatusStamp status="VERIFIED" />)
    rerender(<StatusStamp status="VERIFIED" />)
    expect(container.firstElementChild?.className).not.toMatch(/flip/)
  })
})
