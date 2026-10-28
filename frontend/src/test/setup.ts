import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import i18n from '../i18n'

i18n.changeLanguage('en')

// jsdom has no IntersectionObserver; report everything as visible.
class FakeIntersectionObserver {
  cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
  }
  observe(target: Element) {
    this.cb([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
window.IntersectionObserver ??= FakeIntersectionObserver as unknown as typeof IntersectionObserver

// jsdom has no canvas: report "no WebGL" quietly, so the 3D scene is skipped.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext

// jsdom does not implement scrolling (the welcome page restores scroll position).
window.scrollTo = (() => {}) as typeof window.scrollTo

// jsdom has no matchMedia.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})
