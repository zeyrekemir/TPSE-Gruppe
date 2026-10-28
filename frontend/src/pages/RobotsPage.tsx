import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type Availability, type Robot } from '../api'
import { useAuth } from '../auth'
import { ArmIcon, PinIcon, PlusIcon, QrIcon, UserIcon } from '../icons'
import { ErrorBox, LiveBadge, StatusBadge } from '../ui'
import { useInterval, useLoad } from '../util'
import RobotForm from './RobotForm'
import { Wave } from '../Wave'

const STAT_ORDER: Availability[] = ['available', 'reserved', 'maintenance', 'defect']

export default function RobotsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data: robots, error, reload } = useLoad<Robot[]>(api.robots)
  useInterval(reload, 10_000) // keeps status and live data fresh
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<Availability | null>(null)
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    const c: Partial<Record<Availability, number>> = {}
    robots?.forEach((r) => (c[r.availability] = (c[r.availability] ?? 0) + 1))
    return c
  }, [robots])

  const visible = robots?.filter(
    (r) =>
      (!filter || r.availability === filter) &&
      `${r.name} ${r.type} ${r.location}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <section>
      <header className="hero">
        <div>
          <p className="eyebrow">{t('app.title')}</p>
          <h1>
          <Wave text={t('nav.robots')} />
        </h1>
        </div>
        {user?.role === 'admin' && !creating && (
          <div className="actions">
            <Link to="/labels" className="button secondary">
              <QrIcon /> {t('labels.print')}
            </Link>
            <button onClick={() => setCreating(true)}>
              <PlusIcon /> {t('robot.new')}
            </button>
          </div>
        )}
      </header>

      <div className="stats">
        {STAT_ORDER.map((s) => (
          <button
            key={s}
            className={`stat sheen stat-${s} ${filter === s ? 'on' : ''}`}
            onClick={() => setFilter(filter === s ? null : s)}
          >
            <span className="stat-num">{counts[s] ?? 0}</span>
            <span className="stat-label">{t(`status.${s}`)}</span>
          </button>
        ))}
      </div>

      {creating && (
        <RobotForm
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            reload()
          }}
        />
      )}

      <input
        className="search"
        type="search"
        placeholder={`${t('common.name')}, ${t('robot.type')}, ${t('robot.location')}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <ErrorBox message={error} />
      {robots?.length === 0 && (
        <div className="empty">
          <ArmIcon width={40} height={40} />
          <p>{t('robot.noRobots')}</p>
        </div>
      )}
      <div className="robot-grid">
        {visible?.map((r, i) => (
          <Link
            key={r.id}
            to={`/robots/${r.id}`}
            className={`robot-card sheen status-${r.availability}`}
            style={{ '--i': i } as CSSProperties}
          >
            <div className="robot-card-head">
              <span className="robot-avatar">
                <ArmIcon />
              </span>
              <div>
                <h2>{r.name}</h2>
                <span className="muted small">{r.type}</span>
              </div>
            </div>
            <div className="badges">
              <StatusBadge status={r.availability} />
              <LiveBadge live={r.live} />
            </div>
            <ul className="meta">
              <li>
                <PinIcon /> {r.location}
              </li>
              <li>
                <UserIcon /> {r.responsible_user?.display_name ?? t('common.none')}
              </li>
            </ul>
            {r.open_tickets > 0 && (
              <span className="ticket-pill">
                {r.open_tickets} {t('robot.openTickets')}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
