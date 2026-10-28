import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Robot } from '../api'
import { PulseIcon } from '../icons'
import { ErrorBox, LiveBadge } from '../ui'
import { formatDateTime } from '../util'

/** Live status of one robot; admins can hand out the key its agent uses to report in. */
export default function LivePanel({ robot, isAdmin, onChange }: { robot: Robot; isAdmin: boolean; onChange: () => void }) {
  const { t, i18n } = useTranslation()
  const [key, setKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const live = robot.live

  async function createKey() {
    if (robot.has_api_key && !confirm(t('live.confirmNewKey'))) return
    try {
      setKey((await api.createRobotKey(robot.id)).api_key)
      onChange()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function revoke() {
    if (!confirm(t('common.confirmDelete'))) return
    await api.revokeRobotKey(robot.id)
    setKey(null)
    onChange()
  }

  if (!live && !isAdmin) return null

  return (
    <div className="card live-panel">
      <div className="live-head">
        <h3>
          <PulseIcon /> {t('live.title')}
        </h3>
        <LiveBadge live={live} />
      </div>
      {live ? (
        <dl className="details">
          {live.message && (
            <>
              <dt>{t('robot.description')}</dt>
              <dd>{live.message}</dd>
            </>
          )}
          {live.battery !== null && (
            <>
              <dt>{t('live.battery')}</dt>
              <dd>
                <span className="meter" role="meter" aria-valuenow={live.battery} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${live.battery}%` }} className={live.battery < 20 ? 'low' : ''} />
                </span>
                {Math.round(live.battery)}%
              </dd>
            </>
          )}
          <dt>{t('live.lastSeen')}</dt>
          <dd>{live.last_seen_at ? formatDateTime(live.last_seen_at, i18n.language) : t('common.none')}</dd>
        </dl>
      ) : (
        <p className="muted">{t('live.noKey')}</p>
      )}
      {key && (
        <div className="key-box">
          <strong>{t('live.keyOnce')}</strong>
          <code>{key}</code>
          <span className="muted small">{t('live.agentHint')}</span>
          <code>
            python robot_agent.py --url {window.location.origin} --robot {robot.id} --key {key}
          </code>
        </div>
      )}
      <ErrorBox message={error} />
      {isAdmin && (
        <div className="actions">
          <button className="secondary" onClick={createKey}>
            {robot.has_api_key ? t('live.newKey') : t('live.createKey')}
          </button>
          {robot.has_api_key && (
            <button className="link danger" onClick={revoke}>
              {t('live.revoke')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
