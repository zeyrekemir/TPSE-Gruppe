import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { setToken, type ExperimentLog } from '../api'
import { AppearanceProvider } from '../appearance'
import { AuthProvider } from '../auth'
import { LogForm, LogTable, ReservationForm } from '../components'
import BoardPage from '../pages/BoardPage'
import RobotDetailPage from '../pages/RobotDetailPage'
import { alice, mockFetch, reservation, robot } from './fixtures'

const conflict = (canOverride: boolean) => ({
  status: 409,
  body: {
    detail: {
      message: 'taken',
      conflicts: [reservation()],
      suggested_start: null,
      suggested_end: null,
      can_override: canOverride,
    },
  },
})

function renderReservationForm(onDone = vi.fn()) {
  render(
    <ReservationForm
      robots={[robot()]}
      initial={{ robot_id: 1, start: new Date(2026, 10, 2, 10), end: new Date(2026, 10, 2, 12) }}
      onDone={onDone}
      onCancel={vi.fn()}
    />,
  )
  return onDone
}

describe('staff override students’ bookings', () => {
  it('offers to replace the bookings when allowed, and sends override', async () => {
    let n = 0
    const calls = mockFetch({
      'POST /api/reservations': () => (n++ === 0 ? conflict(true) : { status: 201, body: reservation() }),
    })
    const onDone = renderReservationForm()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Replace these bookings' }))

    expect(JSON.parse(String(calls[0].init?.body)).override).toBeUndefined()
    expect(JSON.parse(String(calls[1].init?.body)).override).toBe(true)
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('offers nothing when the person may not override', async () => {
    mockFetch({ 'POST /api/reservations': () => conflict(false) })
    renderReservationForm()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('This slot is already taken.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Replace these bookings' })).toBeNull()
  })
})

const log = (overrides: Partial<ExperimentLog> = {}): ExperimentLog => ({
  id: 5,
  robot_id: 1,
  robot_name: 'Franka 1',
  user: alice,
  date: '2026-11-02T10:00:00Z',
  title: 'Grasp test',
  description: null,
  procedure: '1. Home pose\n2. Grasp 50 times',
  result: 'success',
  attachments: [{ id: 9, filename: 'plot.png', content_type: 'image/png', size: 2048, created_at: '' }],
  created_at: '',
  ...overrides,
})

const withAuth = (ui: React.ReactNode, path = '/') => (
  <MemoryRouter initialEntries={[path]}>
    <AppearanceProvider>
      <AuthProvider>{ui}</AuthProvider>
    </AppearanceProvider>
  </MemoryRouter>
)

describe('experiment logs: procedure and files', () => {
  it('uploads the chosen files after saving the log, with its procedure', async () => {
    const calls = mockFetch({
      'POST /api/logs': () => ({ status: 201, body: log({ attachments: [] }) }),
      'POST /api/logs/5/attachments': () => ({ status: 201, body: log().attachments[0] }),
    })
    const onDone = vi.fn()
    render(<LogForm robots={[robot()]} robotId={1} onDone={onDone} />)
    await userEvent.type(screen.getByLabelText('Title'), 'Grasp test')
    await userEvent.type(screen.getByLabelText('Procedure'), 'Home pose')
    const file = new File(['png'], 'plot.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Files'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(JSON.parse(String(calls[0].init?.body)).procedure).toBe('Home pose')
    expect(calls[1].path).toBe('/api/logs/5/attachments')
    expect((calls[1].init?.body as FormData).get('file')).toBe(file)
  })

  it('shows the procedure and files; the author can remove a file', async () => {
    setToken('t')
    const calls = mockFetch({
      'GET /api/auth/me': () => ({ body: alice }),
      'DELETE /api/logs/5/attachments/9': () => ({ status: 204 }),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onChange = vi.fn()
    render(withAuth(<LogTable logs={[log()]} showRobot={false} onChange={onChange} />))

    expect(screen.getByText('Procedure')).toBeInTheDocument()
    const files = screen.getByRole('list', { name: 'Files' })
    expect(within(files).getByRole('button', { name: 'plot.png' })).toBeInTheDocument()
    expect(within(files).getByText('2 KB')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete: plot.png' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/logs/5/attachments/9')).toBe(true)
  })
})

describe('robot page: specification and last use', () => {
  it('shows firmware, operating system, equipment and who used it last', async () => {
    setToken('t')
    mockFetch({
      'GET /api/auth/me': () => ({ body: alice }),
      'GET /api/robots/1': () => ({
        body: robot({
          firmware: '5.6.0',
          operating_system: 'Ubuntu 22.04',
          equipment: ['Franka Hand', 'RealSense D435'],
          last_use: { user: { id: 3, username: 'bob', display_name: 'Bob' }, start: '2026-11-01T09:00:00Z', end: '2026-11-01T11:00:00Z' },
        }),
      }),
      'GET /api/reservations': () => ({ body: [] }),
      'GET /api/tickets': () => ({ body: [] }),
      'GET /api/logs': () => ({ body: [] }),
      'GET /api/users': () => ({ body: [alice] }),
    })
    render(
      withAuth(
        <Routes>
          <Route path="/robots/:id" element={<RobotDetailPage />} />
        </Routes>,
        '/robots/1',
      ),
    )
    expect(await screen.findByText('5.6.0')).toBeInTheDocument()
    expect(screen.getByText('Ubuntu 22.04')).toBeInTheDocument()
    const equipment = screen.getByRole('list', { name: 'Equipment' })
    expect(within(equipment).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Franka Hand', 'RealSense D435'])
    expect(screen.getByText('Last used by').nextElementSibling).toHaveTextContent(/^Bob/)
  })
})

describe('TV board', () => {
  it('shows each robot with who has it now and who is next', async () => {
    const now = Date.now()
    const iso = (h: number) => new Date(now + h * 3600_000).toISOString()
    mockFetch({
      'GET /api/robots': () => ({
        body: [
          robot({ availability: 'reserved' }),
          robot({ id: 2, name: 'Tiago', status: 'defect', availability: 'defect', open_tickets: 2 }),
        ],
      }),
      'GET /api/reservations': () => ({
        body: [
          reservation({ start: iso(-1), end: iso(1) }),
          reservation({ id: 8, start: iso(2), end: iso(3), user: { id: 4, username: 'cara', display_name: 'Cara' } }),
        ],
      }),
    })
    render(
      <MemoryRouter>
        <BoardPage />
      </MemoryRouter>,
    )
    const franka = (await screen.findByRole('heading', { name: 'Franka 1' })).closest('li')!
    expect(within(franka).getByText('Now').nextElementSibling).toHaveTextContent(/^Bob until/)
    expect(within(franka).getByText('Next today').nextElementSibling).toHaveTextContent(/Cara$/)
    const tiago = screen.getByRole('heading', { name: 'Tiago' }).closest('li')!
    expect(within(tiago).getByText('Now').nextElementSibling).toHaveTextContent('Defect')
    expect(within(tiago).getByText('2 open issues')).toBeInTheDocument()
    expect(screen.getByText('0 free · 1 in use · 1 out of service')).toBeInTheDocument()
  })
})
