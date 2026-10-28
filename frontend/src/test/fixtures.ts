import { vi } from 'vitest'
import type { Reservation, Robot, User } from '../api'

export const alice: User = {
  id: 2,
  username: 'alice',
  display_name: 'Alice',
  email: null,
  role: 'member',
  auth_source: 'local',
  language: 'en',
  is_active: true,
}

export function robot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 1,
    name: 'Franka 1',
    type: 'Franka Panda',
    location: 'Lab A',
    responsible_user: null,
    documentation_url: null,
    description: null,
    status: 'available',
    availability: 'available',
    current_reservation_id: null,
    open_tickets: 0,
    live: null,
    has_api_key: false,
    created_at: '2026-10-01T10:00:00Z',
    ...overrides,
  }
}

export function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 7,
    robot_id: 1,
    robot_name: 'Franka 1',
    user: { id: 3, username: 'bob', display_name: 'Bob' },
    start: '2026-11-02T09:00:00Z',
    end: '2026-11-02T11:00:00Z',
    purpose: null,
    created_at: '2026-10-01T10:00:00Z',
    ...overrides,
  }
}

/** Replace fetch with a router: keys are "METHOD /api/path" (query string ignored). */
export function mockFetch(routes: Record<string, (init?: RequestInit) => { status?: number; body?: unknown }>) {
  const calls: { method: string; path: string; init?: RequestInit }[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    calls.push({ method, path: url.pathname + url.search, init })
    const handler = routes[`${method} ${url.pathname}`]
    if (!handler) return new Response(JSON.stringify({ detail: 'Not mocked' }), { status: 404 })
    const { status = 200, body } = handler(init)
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return calls
}
