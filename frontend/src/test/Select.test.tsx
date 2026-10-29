import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { robotDetails } from '../options'
import { Select } from '../Select'
import { robot } from './fixtures'

const robots = [robot(), robot({ id: 2, name: 'xArm 6', type: 'UFACTORY xArm 6', location: 'A114', availability: 'reserved' })]

function Harness() {
  const [value, setValue] = useState<number | ''>('')
  return (
    <>
      <label>
        Robot
        <Select details={robotDetails(robots)} value={value} onChange={(e) => setValue(e.target.value ? Number(e.target.value) : '')} required>
          <option value="">—</option>
          {robots.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </label>
      <output>{String(value)}</output>
    </>
  )
}

describe('Select', () => {
  it('keeps the native select as the labelled, required control', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Robot')).toBeRequired()
    expect(screen.getByLabelText('Robot')).toHaveValue('')
  })

  it('opens its own list with each robot’s details and status, and picks one', async () => {
    render(<Harness />)
    fireEvent.mouseDown(screen.getByLabelText('Robot'))
    const list = screen.getByRole('listbox', { name: 'Robot' })
    const xarm = within(list).getByRole('option', { name: /xArm 6/ })
    expect(xarm).toHaveTextContent('UFACTORY xArm 6 · A114')
    expect(xarm).toHaveTextContent('Reserved')
    await userEvent.click(xarm)
    expect(screen.getByLabelText('Robot')).toHaveValue('2')
  })

  it('is used by keyboard: Enter opens, arrows move, Enter picks, Escape closes', async () => {
    render(<Harness />)
    screen.getByLabelText('Robot').focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('listbox')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByLabelText('Robot')).toHaveValue('1')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByLabelText('Robot')).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
