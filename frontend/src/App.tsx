import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppearanceProvider, useAppearance } from './appearance'
import AppearancePanel from './AppearancePanel'
import { AuthProvider, useAuth } from './auth'
import { Logo, LogoMark } from './Logo'
import Backdrop from './Backdrop'
import { CalendarIcon, ChartIcon, FlaskIcon, LogoutIcon, RobotIcon, UsersIcon, WrenchIcon } from './icons'
import LoginPage from './pages/LoginPage'
import RobotsPage from './pages/RobotsPage'
import RobotDetailPage from './pages/RobotDetailPage'
import TicketsPage from './pages/TicketsPage'
import LogsPage from './pages/LogsPage'
import UsersPage from './pages/UsersPage'
import LabelsPage from './pages/LabelsPage'

// Heavy pages are loaded on demand.
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const WelcomePage = lazy(() => import('./intro/WelcomePage'))

function storyEnabled(setting: boolean) {
  return setting && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Moving light reflection on glass cards, following the pointer (at most once per frame). */
function usePointerSheen() {
  useEffect(() => {
    let pending: PointerEvent | null = null
    let raf = 0
    const apply = () => {
      raf = 0
      const e = pending!
      const el = (e.target as HTMLElement).closest?.<HTMLElement>('.sheen')
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    const onMove = (e: PointerEvent) => {
      pending = e
      if (!raf) raf = requestAnimationFrame(apply)
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])
}

/**
 * The liquid background only flows while the user is idle. Any moving pixel behind the glass forces every
 * panel to be re-blurred each frame, so freezing it during scrolling, pointer movement and typing keeps
 * interaction at the display's full refresh rate (e.g. 120 Hz). It resumes where it stopped.
 */
function usePauseMotionWhileInteracting() {
  useEffect(() => {
    const root = document.documentElement
    let timer: ReturnType<typeof setTimeout> | undefined
    const onActivity = () => {
      root.classList.add('motion-paused')
      clearTimeout(timer)
      timer = setTimeout(() => root.classList.remove('motion-paused'), 1200)
    }
    const events = ['scroll', 'wheel', 'touchmove', 'pointermove', 'pointerdown', 'keydown'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }))
    }
  }, [])
}

function Shell() {
  const { t, i18n } = useTranslation()
  const { user, loading, logout, setLanguage } = useAuth()
  const { appearance } = useAppearance()
  const navigate = useNavigate()
  usePointerSheen()
  usePauseMotionWhileInteracting()

  let content
  if (loading) {
    content = (
      <div className="splash">
        <LogoMark size={64} />
      </div>
    )
  } else if (!user) {
    // Signed out: the scroll story leads into the sign-in form (or just the form, if the story is off).
    content = storyEnabled(appearance.intro) ? (
      <Suspense fallback={<LoginPage />}>
        <WelcomePage>
          <LoginPage />
        </WelcomePage>
      </Suspense>
    ) : (
      <LoginPage />
    )
  } else {
    const links = [
      { to: '/robots', label: t('nav.robots'), icon: <RobotIcon /> },
      { to: '/calendar', label: t('nav.calendar'), icon: <CalendarIcon /> },
      { to: '/tickets', label: t('nav.tickets'), icon: <WrenchIcon /> },
      { to: '/logs', label: t('nav.logs'), icon: <FlaskIcon /> },
      { to: '/stats', label: t('nav.stats'), icon: <ChartIcon /> },
      ...(user.role === 'admin' ? [{ to: '/users', label: t('nav.users'), icon: <UsersIcon /> }] : []),
    ]
    const app = (
      <div className="layout">
        <aside className="sidebar glass">
          <div className="brand">
            <Logo size={42} />
            <small className="brand-org">PEARL Lab · TU Darmstadt</small>
          </div>
          <nav>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to}>
                {l.icon}
                <span>{l.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="segmented" role="group" aria-label="Language">
              {(['de', 'en'] as const).map((lng) => (
                <button key={lng} className={i18n.language === lng ? 'on' : ''} onClick={() => setLanguage(lng)}>
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>
            <AppearancePanel onReplayIntro={() => navigate('/welcome')} />
            <div className="me">
              <span className="avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>
              <span className="me-name">
                {user.display_name}
                <small>{t(`user.roles.${user.role}`)}</small>
              </span>
              <button className="icon-btn" onClick={logout} aria-label={t('nav.logout')} title={t('nav.logout')}>
                <LogoutIcon />
              </button>
            </div>
          </div>
        </aside>
        <main className="page-enter" key={user.id}>
          <Suspense fallback={<p className="muted">{t('common.loading')}</p>}>
            <Routes>
              <Route path="/robots" element={<RobotsPage />} />
              <Route path="/robots/:id" element={<RobotDetailPage />} />
              <Route path="/robots/:id/label" element={<LabelsPage />} />
              <Route path="/labels" element={<LabelsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/stats" element={<StatsPage />} />
              {user.role === 'admin' && <Route path="/users" element={<UsersPage />} />}
              <Route path="*" element={<Navigate to="/robots" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    )
    content = (
      <Routes>
        <Route
          path="/welcome"
          element={
            <Suspense fallback={null}>
              <WelcomePage>
                <div className="story-enter">
                  <Link to="/robots" className="button">
                    {t('story.enter')}
                  </Link>
                </div>
              </WelcomePage>
            </Suspense>
          }
        />
        <Route path="*" element={app} />
      </Routes>
    )
  }

  return (
    <>
      <Backdrop signedIn={!!user} />
      {content}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppearanceProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </AppearanceProvider>
    </BrowserRouter>
  )
}
