import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import i18n from './i18n'
import { api, getToken, setToken, type User } from './api'
import { sound } from './sound'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  setLanguage: (lng: 'de' | 'en') => void
  /** Set when single sign-on came back with an error (e.g. "denied", "state"). */
  ssoError: string | null
}

/**
 * After single sign-on the backend redirects to /#token=... (or /#sso_error=...). Take it out of the URL
 * right away so it never stays in the address bar or history.
 */
function consumeSsoFragment(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const token = params.get('token')
  const error = params.get('sso_error')
  if (!token && !error) return null
  if (token) setToken(token)
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return error
}

const AuthContext = createContext<AuthState>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ssoError] = useState(consumeSsoFragment)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!getToken())

  const applyUser = (u: User) => {
    setUser(u)
    i18n.changeLanguage(u.language)
  }

  useEffect(() => {
    if (!getToken()) return
    api.me().then(applyUser).catch(() => setToken(null)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('robots:logout', onLogout)
    return () => window.removeEventListener('robots:logout', onLogout)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    await api.login(username, password)
    applyUser(await api.me())
    sound.success()
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const setLanguage = useCallback(
    (lng: 'de' | 'en') => {
      i18n.changeLanguage(lng)
      if (user) api.updateMe({ language: lng }).then(setUser).catch(() => {})
    },
    [user],
  )

  return <AuthContext.Provider value={{ user, loading, login, logout, setLanguage, ssoError }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
