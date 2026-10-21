import { fireEvent, render, screen } from '@testing-library/react'
import { Ledger } from './Ledger'
import type { RecordRow } from '../lib/types'

const rows: RecordRow[] = [
  { id: 3, content: 'Third', status: 'TAMPERED', version: 1, anchoredAt: 1, inDatabase: true },
  { id: 2, content: null, status: 'MISSING_FROM_DB', version: 1, anchoredAt: 1, inDatabase: false },
  { id: 1, content: 'First', status: 'VERIFIED', version: 2, anchoredAt: 1, inDatabase: true },
]

function setup(selectedId: number | null = null, records: RecordRow[] | undefined = rows) {
  const onSelect = vi.fn()
  render(
    <Ledger
      records={records}
      loading={false}
      error={null}
      onRetry={() => {}}
      selectedId={selectedId}
      onSelect={onSelect}
      networkLabel="Local chain"
    />,
  )
  return onSelect
}

const bodyRows = () => screen.getAllByRole('row').slice(1)

describe('Ledger', () => {
  it('lists every note with its status in words, not colour alone', () => {
    setup()
    expect(screen.getByText('Tampered')).toBeInTheDocument()
    expect(screen.getByText('Missing from database')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
  })

  it('shows a record that only the chain remembers as a ghost row', () => {
    setup()
    expect(screen.getByText('Not in the database')).toBeInTheDocument()
  })

  it('selects a row when clicked', () => {
    const onSelect = setup()
    fireEvent.click(screen.getByText('First'))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('makes exactly one row a tab stop: the selected one', () => {
    setup(1)
    expect(bodyRows().map((r) => r.tabIndex)).toEqual([-1, -1, 0])
  })

  it('makes the first row the tab stop when nothing is selected', () => {
    setup(null)
    expect(bodyRows().map((r) => r.tabIndex)).toEqual([0, -1, -1])
  })

  it('moves the selection with the arrow keys and stops at the ends', () => {
    const onSelect = setup(2)
    fireEvent.keyDown(bodyRows()[1], { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(bodyRows()[1], { key: 'ArrowUp' })
    expect(onSelect).toHaveBeenLastCalledWith(3)
    fireEvent.keyDown(bodyRows()[2], { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith(1) // already last: stays on it
    fireEvent.keyDown(bodyRows()[0], { key: 'ArrowUp' })
    expect(onSelect).toHaveBeenLastCalledWith(3) // already first: stays on it
  })

  it('jumps with Home and End, and selects with Enter or Space', () => {
    const onSelect = setup(2)
    const middle = bodyRows()[1]
    fireEvent.keyDown(middle, { key: 'End' })
    expect(onSelect).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(middle, { key: 'Home' })
    expect(onSelect).toHaveBeenLastCalledWith(3)
    fireEvent.keyDown(middle, { key: 'Enter' })
    expect(onSelect).toHaveBeenLastCalledWith(2)
    fireEvent.keyDown(middle, { key: ' ' })
    expect(onSelect).toHaveBeenLastCalledWith(2)
  })

  it('moves keyboard focus to the row it selects', () => {
    setup(2)
    fireEvent.keyDown(bodyRows()[1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(bodyRows()[2])
  })

  it('invites the first note when there are none', () => {
    setup(null, [])
    expect(screen.getByRole('heading', { name: /no notes on local chain yet/i })).toBeInTheDocument()
  })

  it('shows a loading state and an explained error', () => {
    const { rerender } = render(
      <Ledger records={undefined} loading error={null} onRetry={() => {}} selectedId={null} onSelect={() => {}} networkLabel="X" />,
    )
    expect(screen.getByLabelText('Loading notes')).toHaveAttribute('aria-busy', 'true')
    const retry = vi.fn()
    rerender(
      <Ledger
        records={undefined}
        loading={false}
        error={new Error('Chain is down')}
        onRetry={retry}
        selectedId={null}
        onSelect={() => {}}
        networkLabel="X"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Chain is down')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
  })
})
