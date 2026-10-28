import { describe, expect, it } from 'vitest'
import { fromLocalInput, toLocalInput } from '../util'

describe('datetime-local helpers', () => {
  it('formats in local time without seconds', () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 3, 59))).toBe('2026-01-05T07:03')
  })

  it('round-trips through ISO with timezone', () => {
    const d = new Date(2026, 10, 2, 14, 30)
    const iso = fromLocalInput(toLocalInput(d))
    expect(iso).toMatch(/Z$/)
    expect(new Date(iso).getTime()).toBe(d.getTime())
  })
})
