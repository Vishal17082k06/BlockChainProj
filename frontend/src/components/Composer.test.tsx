import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Composer, MAX_NOTE_LENGTH } from './Composer'

describe('Composer', () => {
  it('names the network the note will be anchored on', () => {
    render(<Composer disabled={false} networkLabel="Sepolia" onSubmit={async () => true} />)
    expect(screen.getByLabelText('New note')).toHaveAttribute('placeholder', expect.stringContaining('Sepolia'))
  })

  it('submits trimmed text and clears the field once it was saved', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<Composer disabled={false} networkLabel="Local" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('New note'), '  Buy stamps  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save and anchor' }))
    expect(onSubmit).toHaveBeenCalledWith('Buy stamps')
    expect(screen.getByLabelText('New note')).toHaveValue('')
  })

  it('keeps the text when the write did not succeed, so nothing typed is lost', async () => {
    render(<Composer disabled={false} networkLabel="Local" onSubmit={async () => false} />)
    await userEvent.type(screen.getByLabelText('New note'), 'Keep me')
    await userEvent.click(screen.getByRole('button', { name: 'Save and anchor' }))
    expect(screen.getByLabelText('New note')).toHaveValue('Keep me')
  })

  it('refuses an empty note with a clear message', async () => {
    const onSubmit = vi.fn()
    render(<Composer disabled={false} networkLabel="Local" onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save and anchor' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(`1 and ${MAX_NOTE_LENGTH}`)
    expect(screen.getByLabelText('New note')).toHaveAttribute('aria-invalid', 'true')
  })

  it('cannot submit while another write is running', () => {
    render(<Composer disabled networkLabel="Local" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save and anchor' })).toBeDisabled()
  })
})
