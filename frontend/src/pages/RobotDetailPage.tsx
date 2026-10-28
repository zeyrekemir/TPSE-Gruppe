import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type RobotStatus } from '../api'
import { useAuth } from '../auth'
import { LogForm, LogTable, ReservationForm, TicketForm, TicketItem } from '../components'
import { QrIcon } from '../icons'
import { ErrorBox, StatusBadge } from '../ui'
import { formatDateTime, useInterval, useLoad } from '../util'
import LivePanel from './LivePanel'
import RobotForm from './RobotForm'

export default function RobotDetailPage() {
  const id = Number(useParams().id)
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const robot = useLoad(() => api.robot(id), [id])
  const now = useMemo(() => new Date().toISOString(), [])
  const reservations = useLoad(() => api.reservations({ robot_id: id, start: now }), [id, now])
  const tickets = useLoad(() => api.tickets({ robot_id: id }), [id])
  const logs = useLoad(() => api.logs({ robot_id: id }), [id])
  const users = useLoad(api.users)
  useInterval(robot.reload, 10_000)
  const [editing, setEditing] = useState(false)
  const [reserving, setReserving] = useState(false)

  const r = robot.data
  if (robot.error) return <ErrorBox message={robot.error} />
  if (!r) return <p>{t('common.loading')}</p>

  const isAdmin = user?.role === 'admin'
  const isResponsible = r.responsible_user?.id === user?.id
  const reloadAll = () => {
    robot.reload()
    reservations.reload()
    tickets.reload()
    logs.reload()
  }

  return (
    <section>
      <p>
        <Link to="/robots">← {t('nav.robots')}</Link>
      </p>
      <div className="page-head">
        <h1>
          {r.name} <StatusBadge status={r.availability} />
        </h1>
        <div className="actions">
          {r.status !== 'defect' && r.status !== 'retired' && (
            <button onClick={() => setReserving(true)}>{t('robot.reserve')}</button>
          )}
          <Link to={`/robots/${r.id}/label`} className="button secondary">
            <QrIcon /> {t('labels.printOne')}
          </Link>
          {isAdmin && (
            <>
              <button className="secondary" onClick={() => setEditing(true)}>
                {t('common.edit')}
              </button>
              <button
                className="secondary danger"
                onClick={async () => {
                  if (confirm(t('common.confirmDelete'))) {
                    await api.deleteRobot(r.id)
                    navigate('/robots')
                  }
                }}
              >
                {t('common.delete')}
              </button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <RobotForm
          robot={r}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false)
            robot.reload()
          }}
        />
      )}
      {reserving && (
        <ReservationForm
          robots={[r]}
          initial={{ robot_id: r.id, start: new Date(), end: new Date(Date.now() + 2 * 3600_000) }}
          onCancel={() => setReserving(false)}
          onDone={() => {
            setReserving(false)
            reloadAll()
          }}
        />
      )}

      <div className="card">
        <dl className="details">
          <dt>{t('robot.type')}</dt>
          <dd>{r.type}</dd>
          <dt>{t('robot.location')}</dt>
          <dd>{r.location}</dd>
          <dt>{t('robot.responsible')}</dt>
          <dd>{r.responsible_user?.display_name ?? t('common.none')}</dd>
          <dt>{t('robot.documentation')}</dt>
          <dd>
            {r.documentation_url ? (
              <a href={r.documentation_url} target="_blank" rel="noreferrer">
                {r.documentation_url}
              </a>
            ) : (
              t('common.none')
            )}
          </dd>
          <dt>{t('robot.status')}</dt>
          <dd>
            {isAdmin || isResponsible ? (
              <select
                value={r.status}
                onChange={async (e) => {
                  await api.updateRobot(r.id, { status: e.target.value as RobotStatus })
                  robot.reload()
                }}
              >
                {(['available', 'maintenance', 'defect', 'retired'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            ) : (
              t(`status.${r.status}`)
            )}
          </dd>
          {r.description && (
            <>
              <dt>{t('robot.description')}</dt>
              <dd className="prewrap">{r.description}</dd>
            </>
          )}
        </dl>
      </div>

      <LivePanel robot={r} isAdmin={isAdmin} onChange={robot.reload} />

      <h2>{t('robot.upcoming')}</h2>
      {reservations.data?.length ? (
        <ul className="plain">
          {reservations.data.map((res) => (
            <li key={res.id}>
              {formatDateTime(res.start, i18n.language)} – {formatDateTime(res.end, i18n.language)} ·{' '}
              <strong>{res.user.display_name}</strong>
              {res.purpose && <span className="muted"> · {res.purpose}</span>}
              {(isAdmin || res.user.id === user?.id) && (
                <button
                  className="link danger"
                  onClick={async () => {
                    if (confirm(t('common.confirmDelete'))) {
                      await api.deleteReservation(res.id)
                      reloadAll()
                    }
                  }}
                >
                  {t('common.delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('common.none')}</p>
      )}

      <h2>{t('nav.tickets')}</h2>
      <TicketForm robots={[r]} robotId={r.id} onDone={reloadAll} />
      <ul className="plain">
        {tickets.data?.map((tk) => (
          <TicketItem key={tk.id} ticket={tk} users={users.data ?? []} onChange={reloadAll} />
        ))}
      </ul>

      <h2>{t('nav.logs')}</h2>
      <LogForm robots={[r]} robotId={r.id} onDone={logs.reload} />
      <LogTable logs={logs.data ?? []} showRobot={false} onChange={logs.reload} />
    </section>
  )
}
