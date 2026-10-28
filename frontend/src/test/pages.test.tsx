import { describe, expect, it } from 'vitest'
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
})
