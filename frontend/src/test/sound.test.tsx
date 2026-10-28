import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppearanceProvider } from '../appearance'
import AppearancePanel from '../AppearancePanel'
import { sound } from '../sound'
import { Wave } from '../Wave'

describe('sound', () => {
  it('plays nothing and throws nothing before the browser allows audio', () => {
    // jsdom has no Web Audio: every call must be a quiet no-op (as before the first click in a real browser).
    expect(() => {
      sound.unlock()
      sound.tick()
      sound.success()
      sound.error()
      sound.logo()
    }).not.toThrow()
  })

  it('has a switch in the appearance panel that is remembered', async () => {
    localStorage.clear()
    const setEnabled = vi.spyOn(sound, 'setEnabled')
    render(
      <AppearanceProvider>
        <AppearancePanel onReplayIntro={() => {}} />
      </AppearanceProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    const box = screen.getByRole('checkbox', { name: 'Sound' })
    expect(box).toBeChecked() // on by default; browsers still wait for the first click
    await userEvent.click(box)
    expect(box).not.toBeChecked()
    expect(setEnabled).toHaveBeenLastCalledWith(false)
    expect(JSON.parse(localStorage.getItem('robots.appearance')!).sound).toBe(false)
  })
})

describe('waving headings', () => {
  it('give screen readers the plain text and keep words together', () => {
    render(
      <h1>
        <Wave text="One place." />
      </h1>,
    )
    expect(screen.getByRole('heading', { name: 'One place.' })).toBeInTheDocument()
    const words = document.querySelectorAll('.wave-word')
    expect(words).toHaveLength(2)
    expect(document.querySelectorAll('.wave-char')).toHaveLength(9)
    expect(words[0].getAttribute('aria-hidden')).toBe('true')
  })
})
