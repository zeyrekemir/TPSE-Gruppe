import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type Reservation, type Robot } from '../api'
import { LogoMark } from '../Logo'
import { ErrorBox, LiveBadge, StatusBadge } from '../ui'
import { useInterval, useLoad } from '../util'

const REFRESH_MS = 15_000

function time(iso: string, lng: string) {
  return new Date(iso).toLocaleTimeString(lng === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** The booking running now, else the next one today, for one robot. */
function nowAndNext(robot: Robot, reservations: Reservation[], now: number) {
  const mine = reservations.filter((r) => r.robot_id === robot.id)
  const current = mine.find((r) => Date.parse(r.start) <= now && Date.parse(r.end) > now)
  const next = mine.filter((r) => Date.parse(r.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0]
  return { current, next }
}

/**
 * Status board for a TV in the lab: every robot as a large tile with its state, who has it now and who is next
 * today. Read-only, no sidebar, refreshes on its own; meant to stay open full screen.
 */
export default function BoardPage() {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const day = useMemo(() => {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start: start.toISOString(), end: end.toISOString() }
    // Only a new day changes the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [new Date(now).toDateString()])
  const robots = useLoad(api.robots)
  const reservations = useLoad(() => api.reservations(day), [day.start])
  useInterval(() => {
    setNow(Date.now())
    robots.reload()
    reservations.reload()
  }, REFRESH_MS)

  const counts = useMemo(() => {
    const c = { available: 0, busy: 0, out: 0 }
    for (const r of robots.data ?? []) {
      if (r.availability === 'available') c.available++
      else if (r.availability === 'reserved') c.busy++
      else c.out++
    }
    return c
  }, [robots.data])

  return (
    <div className="board">
      <header className="board-head">
        <div className="board-brand">
          <LogoMark size={56} />
          <div>
            <h1>{t('board.title')}</h1>
            <p className="muted">
              {t('board.summary', { available: counts.available, busy: counts.busy, out: counts.out })}
            </p>
          </div>
        </div>
        <div className="board-clock" aria-live="off">
          <span>{time(new Date(now).toISOString(), i18n.language)}</span>
          <small>
            {new Date(now).toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </small>
        </div>
        <Link to="/robots" className="button secondary board-exit">
          {t('board.exit')}
        </Link>
      </header>
      <ErrorBox message={robots.error ?? reservations.error} />
      <ul className="board-grid">
        {robots.data?.map((r) => {
          const { current, next } = nowAndNext(r, reservations.data ?? [], now)
          return (
            <li key={r.id} className={`glass board-tile tile-${r.availability}`}>
              <div className="board-tile-head">
                <h2>{r.name}</h2>
                <StatusBadge status={r.availability} />
              </div>
              <p className="muted">
                {r.type} · {r.location}
              </p>
              <dl>
                <dt>{t('board.now')}</dt>
                <dd>
                  {current ? (
                    <>
                      <strong>{current.user.display_name}</strong> {t('board.until', { time: time(current.end, i18n.language) })}
                    </>
                  ) : r.availability === 'available' ? (
                    t('board.free')
                  ) : (
                    t(`status.${r.availability}`)
                  )}
                </dd>
                <dt>{t('board.next')}</dt>
                <dd>
                  {next ? (
                    <>
                      {time(next.start, i18n.language)} · <strong>{next.user.display_name}</strong>
                    </>
                  ) : (
                    t('board.nothingToday')
                  )}
                </dd>
              </dl>
              <div className="board-foot">
                {r.live && <LiveBadge live={r.live} />}
                {r.live?.battery != null && (
                  <span className="muted">
                    {t('live.battery')} {Math.round(r.live.battery)}%
                  </span>
                )}
                {r.open_tickets > 0 && <span className="board-issues">{t('board.issues', { count: r.open_tickets })}</span>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
