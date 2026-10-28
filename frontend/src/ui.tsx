import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Availability, LiveStatus } from './api'
import { sound } from './sound'

export function StatusBadge({ status }: { status: Availability }) {
  const { t } = useTranslation()
  return <span className={`badge badge-${status}`}>{t(`status.${status}`)}</span>
}

export function ErrorBox({ message }: { message: string | null }) {
  // A low tone when an error appears (or changes), so it is noticed even if it is off screen.
  useEffect(() => {
    if (message) sound.error()
  }, [message])
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null
}

export function LiveBadge({ live }: { live: LiveStatus | null }) {
  const { t } = useTranslation()
  if (!live) return null
  const title = live.last_seen_at ? `${t('live.lastSeen')}: ${new Date(live.last_seen_at).toLocaleString()}` : undefined
  return (
    <span className={`live ${live.online ? 'live-on' : 'live-off'}`} title={title}>
      <i aria-hidden />
      {live.online ? live.state ?? t('live.online') : t('live.offline')}
      {live.online && live.battery !== null && <small> · {Math.round(live.battery)}%</small>}
    </span>
  )
}
