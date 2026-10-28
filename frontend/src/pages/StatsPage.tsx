import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type Stats } from '../api'
import { useAppearance } from '../appearance'
import { ErrorBox } from '../ui'
import { useLoad } from '../util'

const PERIODS = [7, 30, 90, 365]

// Sequential blue ramp (light -> dark). Light theme maps 0 -> lightest; dark theme runs the other way,
// so "near zero" always recedes into the surface.
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
const BAR = '#3987e5'

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

function rampColor(t: number, dark: boolean) {
  const ramp = dark ? [...RAMP].reverse().slice(0, 6) : RAMP
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1)
  const i = Math.min(ramp.length - 2, Math.floor(x))
  return mix(ramp[i], ramp[i + 1], x - i)
}

const fmtHours = (h: number) => (h >= 100 ? Math.round(h).toString() : h.toFixed(1).replace(/\.0$/, ''))
const fmtPct = (x: number) => `${Math.round(x * 100)} %`

/** Tooltip that follows the pointer inside a chart. */
function useTooltip() {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null)
  const show = (e: React.PointerEvent, content: ReactNode) => {
    const box = ref.current!.getBoundingClientRect()
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content })
  }
  const node = tip && (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.content}
    </div>
  )
  return { ref, show, hide: () => setTip(null), node }
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi card">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  )
}

function UtilizationBars({ stats }: { stats: Stats }) {
  const { t } = useTranslation()
  const tip = useTooltip()
  const rows = [...stats.robots].sort((a, b) => b.utilization - a.utilization)
  const max = Math.max(0.25, ...rows.map((r) => r.utilization)) // keep small values from filling the width
  return (
    <div className="viz-wrap" ref={tip.ref} onPointerLeave={tip.hide}>
      <ul className="hbars">
        {rows.map((r) => (
          <li
            key={r.robot_id}
            onPointerMove={(e) =>
              tip.show(
                e,
                <>
                  <strong>{r.name}</strong>
                  <span>
                    {fmtPct(r.utilization)} · {fmtHours(r.reserved_hours)} {t('stats.hours')} · {r.reservations}{' '}
                    {t('stats.reservations')}
                  </span>
                </>,
              )
            }
          >
            <Link to={`/robots/${r.robot_id}`} className="hbar-name">
              {r.name}
            </Link>
            <span className="hbar-track">
              <span className="hbar-fill" style={{ width: `${(r.utilization / max) * 100}%`, background: BAR }} />
            </span>
            <span className="hbar-value">{fmtPct(r.utilization)}</span>
          </li>
        ))}
      </ul>
      {tip.node}
    </div>
  )
}

function DailyColumns({ stats }: { stats: Stats }) {
  const { t, i18n } = useTranslation()
  const tip = useTooltip()
  const days = stats.daily
  const W = 720
  const H = 200
  const pad = { l: 34, r: 8, t: 10, b: 24 }
  const max = Math.max(1, ...days.map((d) => d.hours))
  const niceMax = Math.ceil(max / 4) * 4 || 4
  const step = (W - pad.l - pad.r) / days.length
  const barW = Math.max(1, step - 2) // 2px surface gap between bars
  const y = (v: number) => H - pad.b - (v / niceMax) * (H - pad.t - pad.b)
  const labelEvery = Math.ceil(days.length / 8)
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB'
  const dateLabel = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })

  return (
    <div className="viz-wrap" ref={tip.ref} onPointerLeave={tip.hide}>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz" role="img" aria-label={t('stats.daily')}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(niceMax * f)} y2={y(niceMax * f)} className="viz-grid" />
            <text x={pad.l - 6} y={y(niceMax * f) + 4} textAnchor="end" className="viz-axis">
              {fmtHours(niceMax * f)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * step + 1
          const h = H - pad.b - y(d.hours)
          return (
            <g
              key={d.date}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{dateLabel(d.date)}</strong>
                    <span>
                      {fmtHours(d.hours)} {t('stats.hours')}
                    </span>
                  </>,
                )
              }
            >
              {/* full-height hit target, larger than the mark */}
              <rect x={x - 1} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" />
              {d.hours > 0 && <rect x={x} y={y(d.hours)} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={BAR} />}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="viz-axis">
                  {dateLabel(d.date)}
                </text>
              )}
            </g>
          )
        })}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="viz-baseline" />
      </svg>
      {tip.node}
    </div>
  )
}

function Heatmap({ stats }: { stats: Stats }) {
  const { t } = useTranslation()
  const tip = useTooltip()
  const dark = useAppearance().appearance.theme === 'dark'
  const weekdays = t('stats.weekdays').split(',')
  const max = Math.max(0.0001, ...stats.heatmap.flat())
  const hours = Array.from({ length: 24 }, (_, h) => h)
  return (
    <div className="viz-wrap" ref={tip.ref} onPointerLeave={tip.hide}>
      <div className="heatmap" role="img" aria-label={t('stats.heatmapHint')}>
        <span />
        {hours.map((h) => (
          <span key={h} className="hm-hour">
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
        {stats.heatmap.map((row, d) => (
          <div key={d} className="hm-row">
            <span className="hm-day">{weekdays[d]}</span>
            {row.map((v, h) => (
              <span
                key={h}
                className="hm-cell"
                style={{ background: v > 0 ? rampColor(v / max, dark) : undefined }}
                onPointerMove={(e) =>
                  tip.show(
                    e,
                    <>
                      <strong>
                        {weekdays[d]} {String(h).padStart(2, '0')}:00–{String(h + 1).padStart(2, '0')}:00
                      </strong>
                      <span>
                        {fmtHours(v)} {t('stats.hours')}
                      </span>
                    </>,
                  )
                }
              />
            ))}
          </div>
        ))}
      </div>
      <div className="hm-legend">
        <span>0</span>
        <span
          className="hm-scale"
          style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((x) => rampColor(x, dark)).join(',')})` }}
        />
        <span>
          {fmtHours(max)} {t('stats.hours')}
        </span>
      </div>
      {tip.node}
    </div>
  )
}

export default function StatsPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)
  const [asTable, setAsTable] = useState(false)
  const { data: stats, error } = useLoad(() => api.stats(days), [days])

  const busiest = useMemo(
    () => (stats ? [...stats.robots].sort((a, b) => b.utilization - a.utilization)[0] : undefined),
    [stats],
  )

  return (
    <section>
      <header className="hero">
        <div>
          <p className="eyebrow">{t('app.title')}</p>
          <h1>{t('nav.stats')}</h1>
        </div>
        <div className="segmented" role="group" aria-label={t('stats.period')}>
          {PERIODS.map((p) => (
            <button key={p} className={days === p ? 'on' : ''} onClick={() => setDays(p)}>
              {t('stats.days', { n: p })}
            </button>
          ))}
        </div>
      </header>
      <ErrorBox message={error} />
      {stats && (
        <>
          <div className="kpis">
            <Kpi label={t('stats.bookedHours')} value={fmtHours(stats.totals.reserved_hours)} />
            <Kpi label={t('stats.reservations')} value={String(stats.totals.reservations)} />
            <Kpi
              label={t('stats.mttr')}
              value={
                stats.totals.mean_time_to_resolve_hours === null
                  ? '–'
                  : `${fmtHours(stats.totals.mean_time_to_resolve_hours)} ${t('stats.hours')}`
              }
              hint={`${stats.totals.faults_opened} ${t('stats.faults')}`}
            />
            <Kpi
              label={t('stats.success')}
              value={stats.totals.experiment_success_rate === null ? '–' : fmtPct(stats.totals.experiment_success_rate)}
              hint={`${stats.totals.experiments} ${t('nav.logs')}`}
            />
          </div>

          {stats.totals.reservations === 0 && <p className="muted">{t('stats.none')}</p>}

          <div className="viz-grid-2">
            <div className="card">
              <h3>{t('stats.utilization')}</h3>
              <p className="muted small">
                {t('stats.utilizationHint')}
                {busiest && busiest.utilization > 0 && ` · ${busiest.name}: ${fmtPct(busiest.utilization)}`}
              </p>
              <UtilizationBars stats={stats} />
            </div>
            <div className="card">
              <h3>{t('stats.heatmap')}</h3>
              <p className="muted small">{t('stats.heatmapHint')}</p>
              <Heatmap stats={stats} />
            </div>
          </div>

          <div className="card">
            <div className="live-head">
              <h3>{t('stats.daily')}</h3>
              <label className="checkbox">
                <input type="checkbox" checked={asTable} onChange={(e) => setAsTable(e.target.checked)} />
                {t('stats.showTable')}
              </label>
            </div>
            {asTable ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('log.date')}</th>
                      <th>{t('stats.bookedHours')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.daily.filter((d) => d.hours > 0).map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{fmtHours(d.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <DailyColumns stats={stats} />
            )}
          </div>

          <h2>{t('stats.topUsers')}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('log.person')}</th>
                  <th>{t('stats.bookedHours')}</th>
                  <th>{t('stats.reservations')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_users.map((u) => (
                  <tr key={u.user_id}>
                    <td>{u.display_name}</td>
                    <td>{fmtHours(u.reserved_hours)}</td>
                    <td>{u.reservations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
