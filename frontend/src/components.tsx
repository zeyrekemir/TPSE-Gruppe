import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  api,
  ApiError,
  type ConflictDetail,
  type ExperimentLog,
  type ExperimentResult,
  type Robot,
  type Ticket,
  type TicketKind,
  type TicketStatus,
  type User,
} from './api'
import { useAuth } from './auth'
import { ErrorBox } from './ui'
import { formatDateTime, fromLocalInput, toLocalInput } from './util'

// --- Reservations ---

export function ReservationForm({
  robots,
  initial,
  onDone,
  onCancel,
}: {
  robots: Robot[]
  initial: { robot_id?: number; start: Date; end: Date }
  onDone: () => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const [robotId, setRobotId] = useState<number | ''>(initial.robot_id ?? '')
  const [start, setStart] = useState(toLocalInput(initial.start))
  const [end, setEnd] = useState(toLocalInput(initial.end))
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictDetail | null>(null)
  const bookable = robots.filter((r) => r.status !== 'defect' && r.status !== 'retired')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (robotId === '') return setError(t('reservation.pickRobot'))
    setError(null)
    setConflict(null)
    try {
      await api.createReservation({
        robot_id: robotId,
        start: fromLocalInput(start),
        end: fromLocalInput(end),
        purpose: purpose || undefined,
      })
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(err.detail as ConflictDetail)
      else setError((err as Error).message)
    }
  }

  function useSuggestion() {
    if (!conflict?.suggested_start || !conflict.suggested_end) return
    setStart(toLocalInput(new Date(conflict.suggested_start)))
    setEnd(toLocalInput(new Date(conflict.suggested_end)))
    setConflict(null)
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h3 className="span-2">{t('reservation.new')}</h3>
      <label>
        {t('reservation.robot')}
        <select value={robotId} onChange={(e) => setRobotId(e.target.value ? Number(e.target.value) : '')} required>
          <option value="">{t('common.none')}</option>
          {bookable.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('reservation.purpose')}
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={512} />
      </label>
      <label>
        {t('reservation.start')}
        <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
      </label>
      <label>
        {t('reservation.end')}
        <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
      </label>
      {conflict && (
        <div className="conflict span-2">
          <strong>{t('reservation.conflict')}</strong>
          <ul>
            {conflict.conflicts.map((c) => (
              <li key={c.id}>
                {t('reservation.conflictsWith')}: {c.user.display_name}, {formatDateTime(c.start, i18n.language)} –{' '}
                {formatDateTime(c.end, i18n.language)}
              </li>
            ))}
          </ul>
          {conflict.suggested_start && conflict.suggested_end && (
            <p>
              {t('reservation.suggestion')}: {formatDateTime(conflict.suggested_start, i18n.language)} –{' '}
              {formatDateTime(conflict.suggested_end, i18n.language)}{' '}
              <button type="button" className="secondary" onClick={useSuggestion}>
                {t('reservation.useSuggestion')}
              </button>
            </p>
          )}
        </div>
      )}
      <ErrorBox message={error} />
      <div className="actions span-2">
        <button type="submit">{t('common.save')}</button>
        <button type="button" className="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}

// --- Tickets ---

export function TicketForm({ robots, robotId, onDone }: { robots: Robot[]; robotId?: number; onDone: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    robot_id: robotId ?? ('' as number | ''),
    kind: 'fault' as TicketKind,
    title: '',
    description: '',
    mark_robot_defect: false,
  })
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (form.robot_id === '') return
    try {
      await api.createTicket({ ...form, robot_id: form.robot_id, description: form.description || undefined })
      setForm((f) => ({ ...f, title: '', description: '', mark_robot_defect: false }))
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h3 className="span-2">{t('ticket.new')}</h3>
      {robotId === undefined && (
        <label>
          {t('reservation.robot')}
          <select
            value={form.robot_id}
            onChange={(e) => setForm({ ...form, robot_id: e.target.value ? Number(e.target.value) : '' })}
            required
          >
            <option value="">{t('common.none')}</option>
            {robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t('ticket.kind')}
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as TicketKind })}>
          <option value="fault">{t('ticket.kinds.fault')}</option>
          <option value="maintenance">{t('ticket.kinds.maintenance')}</option>
        </select>
      </label>
      <label className="span-2">
        {t('ticket.title')}
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      </label>
      <label className="span-2">
        {t('robot.description')}
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
      </label>
      {form.kind === 'fault' && (
        <label className="checkbox span-2">
          <input
            type="checkbox"
            checked={form.mark_robot_defect}
            onChange={(e) => setForm({ ...form, mark_robot_defect: e.target.checked })}
          />
          {t('ticket.markDefect')}
        </label>
      )}
      <ErrorBox message={error} />
      <div className="actions span-2">
        <button type="submit">{t('common.add')}</button>
      </div>
    </form>
  )
}

export function TicketItem({ ticket, users, onChange }: { ticket: Ticket; users: User[]; onChange: () => void }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Same rule as the backend: admin, reporter, assignee or the robot's responsible person.
  const canManage =
    user?.role === 'admin' ||
    user?.id === ticket.reporter.id ||
    user?.id === ticket.assignee?.id ||
    user?.id === ticket.robot_responsible_id

  async function update(data: { status?: TicketStatus; assignee_id?: number | null; comment?: string }) {
    try {
      await api.updateTicket(ticket.id, data)
      setComment('')
      setError(null)
      onChange()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const statusName = (s: TicketStatus | null) => (s ? t(`ticket.statuses.${s}`) : '')

  return (
    <li className={`card ticket ticket-${ticket.status}`}>
      <div className="ticket-head" onClick={() => setOpen(!open)}>
        <span className={`badge badge-kind-${ticket.kind}`}>{t(`ticket.kinds.${ticket.kind}`)}</span>
        <strong>{ticket.title}</strong>
        <span className="muted">
          {ticket.robot_name} · {formatDateTime(ticket.created_at, i18n.language)}
        </span>
        <span className={`badge badge-ticket-${ticket.status}`}>{statusName(ticket.status)}</span>
      </div>
      {open && (
        <div className="ticket-body">
          {ticket.description && <p>{ticket.description}</p>}
          <div className="form-grid">
            <label>
              {t('ticket.status')}
              <select
                value={ticket.status}
                disabled={!canManage}
                onChange={(e) => update({ status: e.target.value as TicketStatus })}
              >
                {(['open', 'in_progress', 'resolved'] as const).map((s) => (
                  <option key={s} value={s}>
                    {statusName(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('ticket.assignee')}
              <select
                value={ticket.assignee?.id ?? ''}
                disabled={!canManage}
                onChange={(e) => update({ assignee_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">{t('common.none')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h4>{t('ticket.history')}</h4>
          <ol className="history">
            {ticket.events.map((ev) => (
              <li key={ev.id}>
                <span className="muted">{formatDateTime(ev.created_at, i18n.language)}</span>{' '}
                <strong>{ev.user.display_name}</strong>{' '}
                {ev.new_status &&
                  (ev.old_status
                    ? t('ticket.changed', { from: statusName(ev.old_status), to: statusName(ev.new_status) })
                    : t('ticket.opened'))}
                {ev.comment && <blockquote>{ev.comment}</blockquote>}
              </li>
            ))}
          </ol>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (comment.trim()) update({ comment })
            }}
          >
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('ticket.comment')} />
            <button type="submit">{t('ticket.addComment')}</button>
          </form>
          <ErrorBox message={error} />
        </div>
      )}
    </li>
  )
}

// --- Experiment logs ---

const RESULTS: ExperimentResult[] = ['success', 'partial', 'failure']

export function LogForm({ robots, robotId, onDone }: { robots: Robot[]; robotId?: number; onDone: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    robot_id: robotId ?? ('' as number | ''),
    date: toLocalInput(new Date()),
    title: '',
    description: '',
    result: 'success' as ExperimentResult,
  })
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (form.robot_id === '') return
    try {
      await api.createLog({
        ...form,
        robot_id: form.robot_id,
        date: fromLocalInput(form.date),
        description: form.description || undefined,
      })
      setForm((f) => ({ ...f, title: '', description: '' }))
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h3 className="span-2">{t('log.new')}</h3>
      {robotId === undefined && (
        <label>
          {t('reservation.robot')}
          <select
            value={form.robot_id}
            onChange={(e) => setForm({ ...form, robot_id: e.target.value ? Number(e.target.value) : '' })}
            required
          >
            <option value="">{t('common.none')}</option>
            {robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t('log.date')}
        <input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
      </label>
      <label>
        {t('log.result')}
        <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as ExperimentResult })}>
          {RESULTS.map((r) => (
            <option key={r} value={r}>
              {t(`log.results.${r}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="span-2">
        {t('log.title')}
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      </label>
      <label className="span-2">
        {t('log.description')}
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
      </label>
      <ErrorBox message={error} />
      <div className="actions span-2">
        <button type="submit">{t('common.add')}</button>
      </div>
    </form>
  )
}

export function LogTable({ logs, showRobot, onChange }: { logs: ExperimentLog[]; showRobot: boolean; onChange: () => void }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  if (logs.length === 0) return <p className="muted">{t('log.noLogs')}</p>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('log.date')}</th>
            {showRobot && <th>{t('reservation.robot')}</th>}
            <th>{t('log.person')}</th>
            <th>{t('log.title')}</th>
            <th>{t('log.result')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="nowrap">{formatDateTime(l.date, i18n.language)}</td>
              {showRobot && <td>{l.robot_name}</td>}
              <td>{l.user.display_name}</td>
              <td>
                {l.title}
                {l.description && <div className="muted small">{l.description}</div>}
              </td>
              <td>
                <span className={`badge badge-result-${l.result}`}>{t(`log.results.${l.result}`)}</span>
              </td>
              <td>
                {(user?.role === 'admin' || user?.id === l.user.id) && (
                  <button
                    className="link danger"
                    onClick={async () => {
                      if (confirm(t('common.confirmDelete'))) {
                        await api.deleteLog(l.id)
                        onChange()
                      }
                    }}
                  >
                    {t('common.delete')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
