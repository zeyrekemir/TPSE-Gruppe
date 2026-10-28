import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import FullCalendar from '@fullcalendar/react'
import type { DateSelectArg, EventClickArg, EventDropArg, EventInput, EventSourceFuncArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import deLocale from '@fullcalendar/core/locales/de'
import { api, ApiError, type ConflictDetail, type Robot } from '../api'
import { useAuth } from '../auth'
import { ReservationForm } from '../components'
import { ErrorBox } from '../ui'
import { formatDateTime, useLoad } from '../util'
import { Wave } from '../Wave'

// Stable colour per robot so bookings are easy to tell apart. No red: that means "defect" elsewhere.
const COLORS = ['#5b5bf7', '#0891b2', '#a855f7', '#16a34a', '#db2777', '#d97706', '#4f46e5', '#0d9488']

export default function CalendarPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { data: robots } = useLoad<Robot[]>(api.robots)
  const [robotFilter, setRobotFilter] = useState<number | ''>('')
  const [mineOnly, setMineOnly] = useState(false)
  const [draft, setDraft] = useState<{ start: Date; end: Date } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const fetchEvents = useCallback(
    async (info: EventSourceFuncArg): Promise<EventInput[]> => {
      const list = await api.reservations({
        start: info.start.toISOString(),
        end: info.end.toISOString(),
        robot_id: robotFilter === '' ? undefined : robotFilter,
        user_id: mineOnly ? user?.id : undefined,
      })
      return list.map((r) => {
        const mine = r.user.id === user?.id
        return {
          id: String(r.id),
          title: `${r.robot_name} · ${r.user.display_name}${r.purpose ? ` · ${r.purpose}` : ''}`,
          start: r.start,
          end: r.end,
          color: COLORS[r.robot_id % COLORS.length],
          editable: mine || user?.role === 'admin',
        }
      })
    },
    // version forces a refetch after changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [robotFilter, mineOnly, user, version],
  )

  async function move(arg: EventDropArg | EventResizeDoneArg) {
    try {
      await api.updateReservation(Number(arg.event.id), {
        start: arg.event.start!.toISOString(),
        end: arg.event.end!.toISOString(),
      })
      setError(null)
    } catch (err) {
      arg.revert()
      if (err instanceof ApiError && err.status === 409) {
        const c = err.detail as ConflictDetail
        setError(
          `${t('reservation.conflict')} ${t('reservation.suggestion')}: ` +
            `${formatDateTime(c.suggested_start!, i18n.language)} – ${formatDateTime(c.suggested_end!, i18n.language)}`,
        )
      } else setError((err as Error).message)
    }
  }

  async function remove(arg: EventClickArg) {
    if (!arg.event.startEditable) return
    if (!confirm(`${arg.event.title}\n\n${t('common.confirmDelete')}`)) return
    try {
      await api.deleteReservation(Number(arg.event.id))
      setVersion((v) => v + 1)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>
          <Wave text={t('nav.calendar')} />
        </h1>
        <div className="actions">
          <select value={robotFilter} onChange={(e) => setRobotFilter(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('common.all')}</option>
            {robots?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            {t('reservation.mine')}
          </label>
          <button onClick={() => setDraft({ start: new Date(), end: new Date(Date.now() + 2 * 3600_000) })}>
            {t('reservation.new')}
          </button>
        </div>
      </div>
      <p className="muted">{t('reservation.selectHint')}</p>
      <ErrorBox message={error} />
      {draft && robots && (
        <ReservationForm
          robots={robots}
          initial={{ ...draft, robot_id: robotFilter === '' ? undefined : robotFilter }}
          onCancel={() => setDraft(null)}
          onDone={() => {
            setDraft(null)
            setVersion((v) => v + 1)
          }}
        />
      )}
      <div className="card calendar">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          locales={[deLocale]}
          locale={i18n.language}
          firstDay={1}
          nowIndicator
          allDaySlot={false}
          scrollTime="07:00:00"
          height={720}
          selectable
          selectMirror
          select={(arg: DateSelectArg) => {
            setDraft({ start: arg.start, end: arg.end })
            arg.view.calendar.unselect()
          }}
          events={fetchEvents}
          eventDrop={move}
          eventResize={move}
          eventClick={remove}
        />
      </div>
    </section>
  )
}
