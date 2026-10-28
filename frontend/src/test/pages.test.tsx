import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AuthProvider } from '../auth'
import { setToken } from '../api'
import RobotsPage from '../pages/RobotsPage'
import { alice, mockFetch, robot } from './fixtures'

const robots = [
  robot({ id: 1, name: 'Franka 1', availability: 'reserved', location: 'Lab A' }),
  robot({ id: 2, name: 'Franka 2', location: 'Lab A' }),
  robot({ id: 3, name: 'Tiago', type: 'PAL TIAGo', location: 'Lab C', status: 'defect', availability: 'defect', open_tickets: 2 }),
]

function renderRobots() {
  setToken('tok')
  mockFetch({
    'GET /api/auth/me': () => ({ body: alice }),
    'GET /api/robots': () => ({ body: robots }),
  })
  render(
    <MemoryRouter>
      <AuthProvider>
        <RobotsPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('RobotsPage', () => {
  it('counts robots per status', async () => {
    renderRobots()
    await screen.findByText('Tiago')
    const stat = (label: string) => screen.getByText(label, { selector: '.stat-label' }).closest('button')!
    expect(within(stat('Available')).getByText('1')).toBeInTheDocument()
    expect(within(stat('Reserved')).getByText('1')).toBeInTheDocument()
    expect(within(stat('Defect')).getByText('1')).toBeInTheDocument()
    expect(within(stat('In maintenance')).getByText('0')).toBeInTheDocument()
    expect(screen.getByText('2 Open tickets')).toBeInTheDocument()
  })

  it('filters by clicking a status tile, and clicking again clears it', async () => {
    renderRobots()
    await screen.findByText('Tiago')
    const defect = screen.getByText('Defect', { selector: '.stat-label' }).closest('button')!
    await userEvent.click(defect)
    expect(screen.queryByText('Franka 1')).toBeNull()
    expect(screen.getByText('Tiago')).toBeInTheDocument()
    await userEvent.click(defect)
    expect(screen.getByText('Franka 1')).toBeInTheDocument()
  })

  it('searches by name, type and location', async () => {
    renderRobots()
    await screen.findByText('Tiago')
    await userEvent.type(screen.getByRole('searchbox'), 'lab c')
    expect(screen.getByText('Tiago')).toBeInTheDocument()
    expect(screen.queryByText('Franka 2')).toBeNull()
  })

  it('hides "New robot" from members', async () => {
    renderRobots()
    await screen.findByText('Tiago')
    expect(screen.queryByRole('button', { name: /New robot/ })).toBeNull()
  })
})

describe('App', () => {
  it('shows the login form when signed out and the app after signing in', async () => {
    mockFetch({
      'POST /api/auth/login': () => ({ body: { access_token: 'tok' } }),
      'GET /api/auth/me': () => ({ body: alice }),
      'GET /api/robots': () => ({ body: robots }),
    })
    window.history.pushState({}, '', '/')
    render(<App />)
    await userEvent.type(await screen.findByLabelText('Username'), 'alice')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Franka 2')).toBeInTheDocument()
    // Members don't get the user administration link.
    expect(screen.queryByRole('link', { name: /Users/ })).toBeNull()
  })

  it('shows an error for wrong credentials', async () => {
    mockFetch({ 'POST /api/auth/login': () => ({ status: 401, body: { detail: 'nope' } }) })
    window.history.pushState({}, '', '/')
    render(<App />)
    await userEvent.type(await screen.findByLabelText('Username'), 'alice')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Wrong username or password')).toBeInTheDocument()
  })

  it('says so when the account is locked after too many wrong passwords', async () => {
    mockFetch({ 'POST /api/auth/login': () => ({ status: 429, body: { detail: 'Too many failed sign-ins.' } }) })
    window.history.pushState({}, '', '/')
    render(<App />)
    await userEvent.type(await screen.findByLabelText('Username'), 'alice')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Too many wrong passwords for this account/)).toBeInTheDocument()
  })
})

describe('Imprint and privacy notice', () => {
  const contact = { name: 'PEARL Lab, Dr. Test', email: 'pearl@lab.test', address: 'S2|02, 64289 Darmstadt', discord: true, tuid: true }

  it('is public: opens without signing in, with the lab contact from the server', async () => {
    mockFetch({ 'GET /api/legal': () => ({ body: contact }) })
    window.history.pushState({}, '', '/impressum')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Imprint' })).toBeInTheDocument()
    expect(screen.getByText(/DE 111 608 628/)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'pearl@lab.test' })).toHaveAttribute('href', 'mailto:pearl@lab.test')
  })

  it('describes the data processed, including Discord only when it is switched on', async () => {
    mockFetch({ 'GET /api/legal': () => ({ body: contact }) })
    window.history.pushState({}, '', '/datenschutz')
    const { unmount } = render(<App />)
    expect(await screen.findByRole('heading', { name: 'Privacy notice' })).toBeInTheDocument()
    expect(await screen.findByText(/Discord Inc\. \(USA\)/)).toBeInTheDocument()
    expect(screen.getByText(/at most 15 minutes/)).toBeInTheDocument()
    unmount()

    mockFetch({ 'GET /api/legal': () => ({ body: { ...contact, discord: false } }) })
    render(<App />)
    await screen.findByRole('heading', { name: 'Privacy notice' })
    expect(screen.queryByText(/Discord Inc/)).toBeNull()
  })

  it('warns while the contact is not entered yet', async () => {
    mockFetch({ 'GET /api/legal': () => ({ body: { name: '', email: '', address: '', discord: false, tuid: false } }) })
    window.history.pushState({}, '', '/impressum')
    render(<App />)
    expect(await screen.findByText(/has not been entered yet/)).toBeInTheDocument()
  })

  it('is linked from the sign-in form', async () => {
    mockFetch({})
    window.history.pushState({}, '', '/')
    render(<App />)
    await screen.findByLabelText('Username')
    expect(screen.getByRole('link', { name: 'Imprint' })).toHaveAttribute('href', '/impressum')
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/datenschutz')
    expect(screen.getByRole('link', { name: 'Accessibility' })).toHaveAttribute('href', '/barrierefreiheit')
  })

  it('has a public accessibility statement with feedback contact and enforcement body', async () => {
    mockFetch({ 'GET /api/legal': () => ({ body: contact }) })
    window.history.pushState({}, '', '/barrierefreiheit')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Accessibility statement' })).toBeInTheDocument()
    expect(screen.getByText(/partially compliant/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'info@schlichtungsstelle-bgg.de' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'pearl@lab.test' })).toBeInTheDocument()
  })

  it('offers "Download my data" on the privacy page only when signed in', async () => {
    mockFetch({ 'GET /api/legal': () => ({ body: contact }) })
    window.history.pushState({}, '', '/datenschutz')
    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: 'Privacy notice' })
    expect(screen.queryByRole('button', { name: 'Download my data' })).toBeNull()
    unmount()

    setToken('tok')
    const exported = { account: { username: 'alice' } }
    mockFetch({
      'GET /api/legal': () => ({ body: contact }),
      'GET /api/auth/me': () => ({ body: alice }),
      'GET /api/auth/me/export': () => ({ body: exported }),
    })
    const created: Blob[] = []
    URL.createObjectURL = (b: Blob) => (created.push(b), 'blob:x')
    URL.revokeObjectURL = () => {}
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}) // no real download
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Download my data' }))
    await vi.waitFor(() => expect(created).toHaveLength(1))
    expect(click).toHaveBeenCalled()
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsText(created[0])
    })
    expect(JSON.parse(text)).toEqual(exported)
  })
})

describe('Users page', () => {
  it('lets an admin erase someone after confirming, but not themselves', async () => {
    setToken('tok')
    const admin = { ...alice, id: 1, username: 'admin', display_name: 'Admin', role: 'admin' as const }
    const bob = { ...alice, id: 2, username: 'bob', display_name: 'Bob' }
    const erased: number[] = []
    mockFetch({
      'GET /api/auth/me': () => ({ body: admin }),
      'GET /api/users': () => ({ body: [admin, bob] }),
      'POST /api/users/2/erase': () => (erased.push(2), { body: { ...bob, username: '[deleted #2]' } }),
    })
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    window.history.pushState({}, '', '/users')
    render(<App />)
    const buttons = await screen.findAllByRole('button', { name: 'Erase' })
    expect(buttons).toHaveLength(1) // only Bob's row
    await userEvent.click(buttons[0])
    expect(erased).toEqual([]) // cancelled
    await userEvent.click(buttons[0])
    await vi.waitFor(() => expect(erased).toEqual([2]))
  })
})
