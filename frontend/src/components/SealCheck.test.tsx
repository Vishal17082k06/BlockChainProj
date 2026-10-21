import { render, screen } from '@testing-library/react'
import { SealCheck } from './SealCheck'
import { diffHex } from '../lib/diffHex'

const A = '5c441319a657dd15db999f6f427ba1685edacceb6d13a2700b1baee881bef979'
const B = 'aced92d4f85fe7e1bd2f45da62070ebfd4d520f0a17459632c1cb40d3f090ab1'

const marked = (container: HTMLElement) => container.querySelectorAll('[data-differs="true"]')

describe('SealCheck', () => {
  it('shows identical fingerprints as identical, with nothing marked', () => {
    const { container } = render(<SealCheck chain={A} database={A} />)
    expect(screen.getByRole('status')).toHaveTextContent('Identical. All 64 characters match.')
    expect(marked(container)).toHaveLength(0)
  })

  it('marks every differing character on BOTH rows and states the real count', () => {
    const expected = diffHex(A, B).differing
    const { container } = render(<SealCheck chain={A} database={B} />)
    expect(marked(container)).toHaveLength(expected * 2)
    expect(screen.getByRole('status')).toHaveTextContent(`${expected} of 64 characters differ.`)
  })

  it('exposes the full fingerprints to assistive technology and for copying', () => {
    render(<SealCheck chain={A} database={B} />)
    expect(screen.getByText(A)).toHaveClass('sr-only')
    expect(screen.getByText(B)).toHaveClass('sr-only')
  })

  it('draws each fingerprint as 8 groups of 8 characters', () => {
    const { container } = render(<SealCheck chain={A} database={A} />)
    const hashes = container.querySelectorAll('[data-fingerprint]')
    expect(hashes).toHaveLength(2)
    hashes.forEach((hash) => {
      const groups = hash.querySelectorAll('[data-group]')
      expect(groups).toHaveLength(8)
      groups.forEach((g) => expect(g.children).toHaveLength(8))
    })
  })

  it('says so when the chain has no fingerprint yet', () => {
    render(<SealCheck chain={null} database={A} />)
    expect(screen.getByRole('status')).toHaveTextContent('The chain holds no fingerprint for this record yet')
    expect(screen.getByText('No fingerprint on the chain yet')).toBeInTheDocument()
  })

  it('says so when the database row is gone, and still shows what the chain remembers', () => {
    const { container } = render(<SealCheck chain={A} database={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('The database row is gone')
    expect(screen.getByText('No row in the database')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-fingerprint]')).toHaveLength(1)
  })

  it('does not pretend to compare when there is nothing on either side', () => {
    render(<SealCheck chain={null} database={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to compare.')
  })
})
