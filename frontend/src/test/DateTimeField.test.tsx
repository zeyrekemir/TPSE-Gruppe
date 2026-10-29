import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTimeField } from '../DateTimeField'

function Harness({ initial = '2026-11-02T10:00' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <label>
      Start
      <DateTimeField value={value} onChange={setValue} required />
    </label>
  )
}

describe('DateTimeField', () => {
  it('keeps the native field as the labelled, required form control', () => {
    render(<Harness />)
    const field = screen.getByLabelText('Start')
    expect(field).toHaveValue('2026-11-02T10:00')
    expect(field).toBeRequired()
  })

  it('opens its own picker on the selected day and picks a new day, keeping the time', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Choose date and time' }))
    const dialog = screen.getByRole('dialog', { name: 'Date and time' })
    expect(within(dialog).getByText('November 2026')).toBeInTheDocument()
    // Keyboard focus starts on the selected day.
    expect(document.activeElement).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(within(dialog).getByRole('gridcell', { name: /Thursday, 19 November 2026/ }))
    expect(screen.getByLabelText('Start')).toHaveValue('2026-11-19T10:00')
  })

  it('sets hour and minute from their columns', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Choose date and time' }))
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: '14' }))
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Minute' })).getByRole('option', { name: '45' }))
    expect(screen.getByLabelText('Start')).toHaveValue('2026-11-02T14:45')
  })

  it('moves by keyboard across days and months, and Escape closes it', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Choose date and time' }))
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{Enter}')
    expect(screen.getByLabelText('Start')).toHaveValue('2026-11-10T10:00')
    await userEvent.keyboard('{PageDown}')
    expect(screen.getByText('December 2026')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Start')).toHaveFocus()
  })
})
