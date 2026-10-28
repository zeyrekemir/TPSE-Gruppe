import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type AuthConfig } from '../api'
import { useAuth } from '../auth'
import { Logo } from '../Logo'
import { ErrorBox } from '../ui'

export default function LoginPage() {
  const { t } = useTranslation()
  const { login, ssoError } = useAuth()
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [logoMissing, setLogoMissing] = useState(false)
  useEffect(() => {
    api.authConfig().then(setConfig).catch(() => setConfig(null))
  }, [])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await login(username, password)
    } catch {
      setError(t('login.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <span className="login-watermark" aria-hidden>
        PEARL
      </span>
      <div className="login-hero">
        <p className="eyebrow">TU Darmstadt · PEARL Lab</p>
        <h2 className="mega">
          Robot
          <br />
          <span className="grad-text">Hub</span>
        </h2>
        <p className="lead">{t('login.tagline')}</p>
        <ul className="chips" aria-label="Robots">
          <li>Franka</li>
          <li>xArm</li>
          <li>Tiago</li>
        </ul>
      </div>
      <form className="login-form glass-strong sheen" onSubmit={submit}>
        <Logo size={56} />
        <h1>{t('login.title')}</h1>
        <p className="muted">{t('app.title')}</p>
        {ssoError && (
          <ErrorBox
            message={
              ssoError === 'unreachable'
                ? t('login.ssoUnreachable', { label: config?.oidc_label ?? 'TU-ID' })
                : t('login.ssoError', { reason: ssoError })
            }
          />
        )}
        {/* TU-style login bar: heading + wide white bar with the TU logo. Always shown so people know it exists;
            inactive until the SSO client is registered. public/tu-logo.svg is TU Darmstadt's official logo
            (from tu-darmstadt.de); the bar shows only its Athene head. Without the file it shows "TU-ID". */}
        <div className="tuid">
          <h3>{t('login.tuidHeading', { label: config?.oidc_label ?? 'TU-ID' })}</h3>
          <button
            type="button"
            className="tuid-bar"
            onClick={api.ssoLogin}
            disabled={!config?.oidc}
            aria-label={t('login.sso', { label: config?.oidc_label ?? 'TU-ID' })}
            aria-describedby={config?.oidc ? undefined : 'sso-hint'}
          >
            {logoMissing ? (
              <span className="tuid-text">{config?.oidc_label ?? 'TU-ID'}</span>
            ) : (
              <span className="tuid-athene">
                <img src="/tu-logo.svg" alt="" onError={() => setLogoMissing(true)} />
              </span>
            )}
          </button>
          {!config?.oidc && (
            <span id="sso-hint" className="muted small">
              {t('login.ssoNotConfigured')}
            </span>
          )}
        </div>
        <span className="divider">{t('login.or')}</span>
        <label>
          {t('login.username')}
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          {t('login.password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <ErrorBox message={error} />
        <button type="submit" disabled={busy}>
          {t('login.submit')}
        </button>
      </form>
    </div>
  )
}
