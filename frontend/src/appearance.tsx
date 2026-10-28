import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

export interface Appearance {
  theme: Theme
  /** Glass opacity in percent: 0 = clear glass, 100 = solid panels. */
  opacity: number
  /** Backdrop blur in px. */
  blur: number
  /** Play the intro animation when the app opens. */
  intro: boolean
  /** Slowly moving colour field behind the glass. Off = static background, cheapest to render. */
  motion: boolean
}

const STORAGE_KEY = 'robots.appearance'

const DEFAULT_APPEARANCE: Appearance = {
  theme: 'dark',
  opacity: 45,
  blur: 16,
  intro: true,
  motion: true,
}

function load(): Appearance {
  const systemTheme: Theme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved && typeof saved === 'object') return { ...DEFAULT_APPEARANCE, theme: systemTheme, ...saved }
  } catch {
    /* ignore broken or blocked storage */
  }
  return { ...DEFAULT_APPEARANCE, theme: systemTheme }
}

/** Write the settings to CSS custom properties on <html>, which the stylesheet reads. */
function applyAppearance(a: Appearance) {
  const root = document.documentElement
  root.dataset.theme = a.theme
  root.dataset.motion = a.motion ? 'on' : 'off'
  root.style.setProperty('--glass-alpha', String(a.opacity / 100))
  root.style.setProperty('--glass-blur', `${a.blur}px`)
}

interface AppearanceState {
  appearance: Appearance
  update: (changes: Partial<Appearance>) => void
  reset: () => void
}

const AppearanceContext = createContext<AppearanceState>(null!)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(load)

  useEffect(() => {
    applyAppearance(appearance)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance))
    } catch {
      /* ignore */
    }
  }, [appearance])

  return (
    <AppearanceContext.Provider
      value={{
        appearance,
        update: (changes) => setAppearance((a) => ({ ...a, ...changes })),
        reset: () => setAppearance({ ...DEFAULT_APPEARANCE, theme: appearance.theme }),
      }}
    >
      {children}
    </AppearanceContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAppearance = () => useContext(AppearanceContext)
