import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AttackLab } from './AttackLab'

function setup(overrides: Partial<Parameters<typeof AttackLab>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    noteId: 4,
    currentText: 'Original text',
    networkLabel: 'Local chain',
    onRun: vi.fn().mockResolvedValue({ ok: true, detail: 'Note 4 was changed directly in the database.' }),
    onVerify: vi.fn(),
    ...overrides,
  }
  render(<AttackLab {...props} />)
  return props
}

describe('AttackLab', () => {
  it('renders nothing when closed or when no note is chosen', () => {
    const { container } = render(
      <AttackLab open={false} onClose={() => {}} noteId={4} currentText="x" networkLabel="Local" onRun={vi.fn()} onVerify={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('is a modal dialog named after the note', () => {
    setup()
    expect(screen.getByRole('dialog', { name: /tamper with note 4/i })).toHaveAttribute('aria-modal', 'true')
  })

  it('starts from the note text and runs a change with the chosen options', async () => {
    const user = userEvent.setup()
    const props = setup()
    const box = screen.getByLabelText('The forged text')
    expect(box).toHaveValue('Original text')
    await user.clear(box)
    await user.type(box, '  Forged  ')
    await user.click(screen.getByLabelText(/cover the tracks/i))
    await user.click(screen.getByRole('button', { name: 'Run the attack' }))
    expect(props.onRun).toHaveBeenCalledWith('edit', { content: 'Forged', coverTracks: true })
    expect(await screen.findByText(/changed directly in the database/i)).toBeInTheDocument()
  })

  it('cannot run a change with an empty forged text', async () => {
    const user = userEvent.setup()
    setup()
    await user.clear(screen.getByLabelText('The forged text'))
    expect(screen.getByRole('button', { name: 'Run the attack' })).toBeDisabled()
  })

  it('sends no text for a delete and hides the text box', async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.click(screen.getByLabelText(/delete the row/i))
    expect(screen.queryByLabelText('The forged text')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run the attack' }))
    expect(props.onRun).toHaveBeenCalledWith('delete', { content: undefined, coverTracks: false })
  })

  it('shows a failed attack as a failure, not a success, and offers no check', async () => {
    const user = userEvent.setup()
    setup({ onRun: vi.fn().mockResolvedValue({ ok: false, detail: 'No earlier text is recorded.' }) })
    await user.click(screen.getByLabelText(/roll back/i))
    await user.click(screen.getByRole('button', { name: 'Run the attack' }))
    expect(await screen.findByText('No earlier text is recorded.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /check against the chain/i })).not.toBeInTheDocument()
  })

  it('closes on Escape, including while an attack is still running and focus has left the dialog', async () => {
    const user = userEvent.setup()
    let finish: () => void = () => {}
    const onRun = vi.fn().mockReturnValue(new Promise((resolve) => (finish = () => resolve({ ok: true, detail: 'done' }))))
    const props = setup({ onRun })
    await user.click(screen.getByRole('button', { name: 'Run the attack' }))
    // The run button is now disabled, so the browser has moved focus to the page.
    expect(screen.getByRole('button', { name: /running/i })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run the attack' })).toBeEnabled())
  })

  it('keeps Tab inside the dialog, wrapping at both ends', () => {
    setup()
    const close = screen.getByRole('button', { name: /close the attack lab/i })
    const run = screen.getByRole('button', { name: 'Run the attack' })
    // fireEvent sends just the key press, so this tests our wrap-around and not the browser's own tabbing.
    close.focus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(run)
    fireEvent.keyDown(run, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
  })

  it('offers the chain check after a successful attack', async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.click(screen.getByRole('button', { name: 'Run the attack' }))
    await user.click(await screen.findByRole('button', { name: /check against the chain/i }))
    expect(props.onVerify).toHaveBeenCalled()
  })
})
