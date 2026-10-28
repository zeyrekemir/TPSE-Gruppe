import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppearanceProvider } from '../appearance'
import AppearancePanel from '../AppearancePanel'
import { AuthProvider } from '../auth'
import Backdrop from '../Backdrop'
import { LogForm, TicketItem } from '../components'
import { setToken, type Stats, type Ticket } from '../api'
import LabelsPage from '../pages/LabelsPage'
import LivePanel from '../pages/LivePanel'
import LoginPage from '../pages/LoginPage'
import StatsPage from '../pages/StatsPage'
import WelcomePage from '../intro/WelcomePage'
import { LiveBadge } from '../ui'
import { alice, mockFetch, robot } from './fixtures'

const withAuth = (ui: React.ReactNode, path = '/') => (
  <MemoryRouter initialEntries={[path]}>
    <AppearanceProvider>
      <AuthProvider>{ui}</AuthProvider>
    </AppearanceProvider>
  </MemoryRouter>
)

describe('live status', () => {
  it('shows online state and battery, or offline', () => {
    const { rerender } = render(
      <LiveBadge live={{ online: true, state: 'running', message: null, battery: 72.6, last_seen_at: '2026-10-28T10:00:00Z' }} />,
    )
    expect(screen.getByText(/running/)).toBeInTheDocument()
    expect(screen.getByText(/73%/)).toBeInTheDocument()
    rerender(<LiveBadge live={{ online: false, state: 'running', message: null, battery: 50, last_seen_at: null }} />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.queryByText(/50%/)).toBeNull()
  })

  it('lets an admin create a key and shows the agent command once', async () => {
    mockFetch({ 'POST /api/robots/1/api-key': () => ({ body: { robot_id: 1, api_key: 'rbk_1_secret' } }) })
    const onChange = vi.fn()
    render(<LivePanel robot={robot()} isAdmin onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }))
    expect(await screen.findByText('rbk_1_secret')).toBeInTheDocument()
    expect(screen.getByText(/robot_agent\.py --url .* --robot 1 --key rbk_1_secret/)).toBeInTheDocument()
    expect(onChange).toHaveBeenCalled()
  })

  it('is hidden from members while the robot has no key', () => {
    const { container } = render(<LivePanel robot={robot()} isAdmin={false} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

const stats: Stats = {
  range: { start: '', end: '', days: 30, lab_hours: 220 },
  totals: {
    reservations: 3, reserved_hours: 12.5, tickets_opened: 2, faults_opened: 1,
    mean_time_to_resolve_hours: 4, experiments: 4, experiment_success_rate: 0.75,
  },
  robots: [
    { robot_id: 1, name: 'Franka 1', reserved_hours: 2, reservations: 1, utilization: 0.01, tickets_opened: 0, mean_time_to_resolve_hours: null, experiments: 0, experiment_success_rate: null },
    { robot_id: 2, name: 'Tiago', reserved_hours: 10.5, reservations: 2, utilization: 0.048, tickets_opened: 2, mean_time_to_resolve_hours: 4, experiments: 4, experiment_success_rate: 0.75 },
  ],
  top_users: [{ user_id: 2, display_name: 'Alice', reserved_hours: 12.5, reservations: 3 }],
  daily: [
    { date: '2026-10-26', hours: 0 },
    { date: '2026-10-27', hours: 12.5 },
  ],
  heatmap: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 2 && h === 10 ? 2 : 0))),
}

describe('statistics page', () => {
  it('shows totals, robots by utilisation, heatmap and a table view', async () => {
    setToken('tok')
    const calls = mockFetch({
      'GET /api/auth/me': () => ({ body: alice }),
      'GET /api/stats': () => ({ body: stats }),
    })
    const { container } = render(withAuth(<StatsPage />))
    await screen.findByText('Booked hours', { selector: '.kpi-label' })
    const kpis = [...container.querySelectorAll('.kpi-value')].map((e) => e.textContent)
    expect(kpis).toEqual(['12.5', '3', '4 h', '75 %'])

    const names = [...container.querySelectorAll('.hbar-name')].map((e) => e.textContent)
    expect(names).toEqual(['Tiago', 'Franka 1']) // busiest first
    expect(container.querySelectorAll('.hm-cell')).toHaveLength(7 * 24)

    await userEvent.click(screen.getByLabelText('Show as table'))
    expect(screen.getByRole('cell', { name: '2026-10-27' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '90 days' }))
    await waitFor(() => expect(calls.some((c) => c.path === '/api/stats?days=90')).toBe(true))
  })
})

describe('QR labels', () => {
  it('renders a QR code pointing at each robot page', async () => {
    setToken('tok')
    mockFetch({
      'GET /api/auth/me': () => ({ body: alice }),
      'GET /api/robots': () => ({ body: [robot(), robot({ id: 2, name: 'Tiago' })] }),
    })
    const { container } = render(
      withAuth(
        <Routes>
          <Route path="/labels" element={<LabelsPage />} />
        </Routes>,
        '/labels',
      ),
    )
    expect(await screen.findByText('Tiago')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelectorAll('.qr svg')).toHaveLength(2))
    expect(screen.getByRole('img', { name: `${window.location.origin}/robots/2` })).toBeInTheDocument()
  })
})

describe('single sign-on', () => {
  it('offers the TU-ID button when the backend has SSO configured', async () => {
    mockFetch({ 'GET /api/auth/config': () => ({ body: { ldap: false, oidc: true, oidc_label: 'TU-ID' } }) })
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location)
    render(withAuth(<LoginPage />))
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with TU-ID' }))
    expect(assign).toHaveBeenCalledWith('/api/auth/oidc/login')
  })

  it('shows the button disabled, with a hint, while SSO is not set up', async () => {
    mockFetch({ 'GET /api/auth/config': () => ({ body: { ldap: false, oidc: false, oidc_label: 'TU-ID' } }) })
    render(withAuth(<LoginPage />))
    await screen.findByRole('button', { name: 'Sign in' })
    const sso = screen.getByRole('button', { name: 'Sign in with TU-ID' })
    expect(sso).toBeDisabled()
    expect(sso).toHaveAccessibleDescription(/registered the app/)
  })

  it('takes the token from the redirect and removes it from the URL', async () => {
    window.history.replaceState(null, '', '/#token=from-sso')
    mockFetch({ 'GET /api/auth/me': () => ({ body: alice }) })
    render(withAuth(<span>app</span>))
    expect(localStorage.getItem('robots.token')).toBe('from-sso')
    expect(window.location.hash).toBe('')
  })

  it('shows SSO errors on the login form', async () => {
    window.history.replaceState(null, '', '/#sso_error=state')
    mockFetch({ 'GET /api/auth/config': () => ({ body: { ldap: false, oidc: true, oidc_label: 'TU-ID' } }) })
    render(withAuth(<LoginPage />))
    expect(await screen.findByText(/Single sign-on failed \(state\)/)).toBeInTheDocument()
  })
})

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 5, robot_id: 1, robot_name: 'Franka 1', kind: 'fault', title: 'Gripper stuck', description: 'Left finger',
  robot_responsible_id: null, status: 'open', reporter: { id: 9, username: 'bob', display_name: 'Bob' }, assignee: null,
  created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z', resolved_at: null,
  events: [{ id: 1, user: { id: 9, username: 'bob', display_name: 'Bob' }, old_status: null, new_status: 'open', comment: null, created_at: '2026-10-27T10:00:00Z' }],
  ...overrides,
})

describe('maintenance tickets', () => {
  it('lets others comment but not change the status', async () => {
    setToken('tok')
    const calls = mockFetch({
      'GET /api/auth/me': () => ({ body: alice }),
      'PATCH /api/tickets/5': () => ({ body: ticket() }),
    })
    const onChange = vi.fn()
    render(withAuth(<ul><TicketItem ticket={ticket()} users={[]} onChange={onChange} /></ul>))
    await screen.findByText('Gripper stuck')
    await waitFor(() => expect(calls.some((c) => c.path === '/api/auth/me')).toBe(true))
    await userEvent.click(screen.getByText('Gripper stuck'))
    expect(screen.getByText('opened the ticket')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Comment'), 'Same here')
    await userEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(JSON.parse(String(patch.init?.body))).toEqual({ comment: 'Same here' })
    expect(onChange).toHaveBeenCalled()
  })

  it("lets the robot's responsible person change the status", async () => {
    setToken('tok')
    mockFetch({ 'GET /api/auth/me': () => ({ body: alice }) })
    render(withAuth(<ul><TicketItem ticket={ticket({ robot_responsible_id: alice.id })} users={[]} onChange={vi.fn()} /></ul>))
    await userEvent.click(await screen.findByText('Gripper stuck'))
    await waitFor(() => expect(screen.getByLabelText('Status')).toBeEnabled())
  })

  it('lets the reporter change the status', async () => {
    setToken('tok')
    mockFetch({ 'GET /api/auth/me': () => ({ body: { ...alice, id: 9 } }) })
    render(withAuth(<ul><TicketItem ticket={ticket()} users={[]} onChange={vi.fn()} /></ul>))
    await userEvent.click(await screen.findByText('Gripper stuck'))
    await waitFor(() => expect(screen.getByLabelText('Status')).toBeEnabled())
  })
})

describe('experiment log form', () => {
  it('sends the date with timezone and clears the title afterwards', async () => {
    const calls = mockFetch({ 'POST /api/logs': () => ({ status: 201, body: {} }) })
    const onDone = vi.fn()
    render(<LogForm robots={[robot()]} robotId={1} onDone={onDone} />)
    await userEvent.type(screen.getByLabelText('Title'), 'Grasping run')
    await userEvent.selectOptions(screen.getByLabelText('Result'), 'partial')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body).toMatchObject({ robot_id: 1, title: 'Grasping run', result: 'partial' })
    expect(body.date).toMatch(/Z$/)
    expect(onDone).toHaveBeenCalled()
    expect(screen.getByLabelText('Title')).toHaveValue('')
  })
})

describe('appearance', () => {
  it('writes glass opacity, blur and motion to the page', async () => {
    render(withAuth(<AppearancePanel onReplayIntro={vi.fn()} />))
    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    const panel = screen.getByRole('dialog')
    const [opacity] = within(panel).getAllByRole('slider')
    fireEvent.change(opacity, { target: { value: '100' } })
    expect(document.documentElement.style.getPropertyValue('--glass-alpha')).toBe('1')
    await userEvent.click(within(panel).getByLabelText('Animated background'))
    expect(document.documentElement.dataset.motion).toBe('off')
    await userEvent.click(within(panel).getByRole('button', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('blueprint backdrop', () => {
  it('poses the arm for the current page', () => {
    const at = (path: string, signedIn = true) => {
      const { container, unmount } = render(
        <MemoryRouter initialEntries={[path]}>
          <Backdrop signedIn={signedIn} />
        </MemoryRouter>,
      )
      const pose = container.querySelector('.backdrop')!.getAttribute('data-pose')
      unmount()
      return pose
    }
    expect(at('/calendar')).toBe('calendar')
    expect(at('/robots/3')).toBe('robots')
    expect(at('/stats')).toBe('stats')
    expect(at('/unknown')).toBe('robots')
    expect(at('/robots', false)).toBe('welcome')
    expect(at('/welcome')).toBe('welcome')
  })
})

describe('welcome story', () => {
  it('shows the story, then the content after it, and skips to it', async () => {
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo as typeof window.scrollTo
    render(withAuth(<WelcomePage><p>sign-in form</p></WelcomePage>))
    expect(screen.getByText('Every robot.')).toBeInTheDocument()
    // Captions exist from the start and are revealed by scrolling (hidden until then).
    expect(screen.getByText('Booking without clashes').tagName).toBe('H2')
    expect(screen.getByText('sign-in form')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Skip to sign-in' }))
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })
})
