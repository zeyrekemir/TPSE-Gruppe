import { describe, expect, it, vi } from 'vitest'
import { api, ApiError, getToken, setToken } from '../api'
import { mockFetch } from './fixtures'

describe('api client', () => {
  it('stores the token on login and sends it afterwards', async () => {
    const calls = mockFetch({
      'POST /api/auth/login': () => ({ body: { access_token: 'tok-123', token_type: 'bearer' } }),
      'GET /api/robots': () => ({ body: [] }),
    })
    await api.login('alice', 'pw')
    expect(getToken()).toBe('tok-123')
    expect(String(calls[0].init?.body)).toBe('username=alice&password=pw')

    await api.robots()
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
  })

  it('rejects a failed login without storing a token', async () => {
    mockFetch({ 'POST /api/auth/login': () => ({ status: 401, body: { detail: 'Wrong username or password' } }) })
    await expect(api.login('alice', 'bad')).rejects.toBeInstanceOf(ApiError)
    expect(getToken()).toBeNull()
  })

  it('drops the token and signals logout on 401', async () => {
    setToken('expired')
    mockFetch({ 'GET /api/robots': () => ({ status: 401, body: { detail: 'Invalid or expired token' } }) })
    const onLogout = vi.fn()
    window.addEventListener('robots:logout', onLogout)
    await expect(api.robots()).rejects.toMatchObject({ status: 401 })
    expect(getToken()).toBeNull()
    expect(onLogout).toHaveBeenCalledOnce()
    window.removeEventListener('robots:logout', onLogout)
  })

  it('keeps the structured 409 detail for conflicts', async () => {
    const detail = { message: 'taken', conflicts: [], suggested_start: 'a', suggested_end: 'b' }
    mockFetch({ 'POST /api/reservations': () => ({ status: 409, body: { detail } }) })
    const err = await api.createReservation({ robot_id: 1, start: 'x', end: 'y' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.detail).toEqual(detail)
    expect(err.message).toBe('taken')
  })

  it('joins validation messages', async () => {
    mockFetch({ 'POST /api/robots': () => ({ status: 422, body: { detail: [{ msg: 'a' }, { msg: 'b' }] } }) })
    await expect(api.createRobot({} as never)).rejects.toThrow('a; b')
  })

  it('returns undefined for 204 and builds query strings without empty values', async () => {
    const calls = mockFetch({
      'DELETE /api/reservations/5': () => ({ status: 204 }),
      'GET /api/reservations': () => ({ body: [] }),
    })
    await expect(api.deleteReservation(5)).resolves.toBeUndefined()
    await api.reservations({ robot_id: 2, user_id: undefined, start: '' })
    expect(calls[1].path).toBe('/api/reservations?robot_id=2')
  })
})
