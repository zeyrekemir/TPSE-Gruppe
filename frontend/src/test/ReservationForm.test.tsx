import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReservationForm } from '../components'
import { toLocalInput } from '../util'
import { mockFetch, reservation, robot } from './fixtures'

const start = new Date(2026, 10, 2, 10, 0)
const end = new Date(2026, 10, 2, 12, 0)

function renderForm(onDone = vi.fn()) {
  render(
    <ReservationForm
      robots={[robot(), robot({ id: 2, name: 'Broken', status: 'defect', availability: 'defect' })]}
      initial={{ robot_id: 1, start, end }}
      onDone={onDone}
      onCancel={vi.fn()}
    />,
  )
  return onDone
}

describe('ReservationForm', () => {
  it('does not offer defect robots', () => {
    renderForm()
    expect(screen.getByRole('option', { name: 'Franka 1' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Broken' })).toBeNull()
  })

  it('sends times with timezone and calls onDone', async () => {
    const calls = mockFetch({ 'POST /api/reservations': () => ({ status: 201, body: reservation() }) })
    const onDone = renderForm()
    await userEvent.type(screen.getByLabelText('Purpose'), 'Demo')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const body = JSON.parse(String(calls[0].init?.body))
    expect(body).toEqual({ robot_id: 1, start: start.toISOString(), end: end.toISOString(), purpose: 'Demo' })
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('shows the conflict and applies the suggested slot', async () => {
    const suggestedStart = new Date(2026, 10, 2, 13, 0)
    const suggestedEnd = new Date(2026, 10, 2, 15, 0)
    mockFetch({
      'POST /api/reservations': () => ({
        status: 409,
        body: {
          detail: {
            message: 'taken',
            conflicts: [reservation()],
            suggested_start: suggestedStart.toISOString(),
            suggested_end: suggestedEnd.toISOString(),
          },
        },
      }),
    })
    const onDone = renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('This slot is already taken.')).toBeInTheDocument()
    expect(screen.getByText(/Conflicts with: Bob/)).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Use this slot' }))
    expect(screen.getByLabelText('Start')).toHaveValue(toLocalInput(suggestedStart))
    expect(screen.getByLabelText('End')).toHaveValue(toLocalInput(suggestedEnd))
    expect(screen.queryByText('This slot is already taken.')).toBeNull()
  })

  it('shows other errors as text', async () => {
    mockFetch({ 'POST /api/reservations': () => ({ status: 400, body: { detail: 'Reservation lies in the past' } }) })
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Reservation lies in the past')).toBeInTheDocument()
  })
})
