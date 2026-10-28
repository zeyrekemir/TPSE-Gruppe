import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Robot, type RobotInput, type RobotStatus, type User } from '../api'
import { ErrorBox } from '../ui'
import { useLoad } from '../util'

const STATUSES: RobotStatus[] = ['available', 'maintenance', 'defect', 'retired']

/** Create or edit a robot (admin only). */
export default function RobotForm({
  robot,
  onDone,
  onCancel,
}: {
  robot?: Robot
  onDone: (r: Robot) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { data: users } = useLoad<User[]>(api.users)
  const [form, setForm] = useState<RobotInput>({
    name: robot?.name ?? '',
    type: robot?.type ?? '',
    location: robot?.location ?? '',
    responsible_user_id: robot?.responsible_user?.id ?? null,
    documentation_url: robot?.documentation_url ?? null,
    description: robot?.description ?? null,
    status: robot?.status ?? 'available',
  })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof RobotInput>(key: K, value: RobotInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      onDone(robot ? await api.updateRobot(robot.id, form) : await api.createRobot(form))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <label>
        {t('common.name')}
        <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
      </label>
      <label>
        {t('robot.type')}
        <input value={form.type} onChange={(e) => set('type', e.target.value)} placeholder="Franka Panda" required />
      </label>
      <label>
        {t('robot.location')}
        <input value={form.location} onChange={(e) => set('location', e.target.value)} required />
      </label>
      <label>
        {t('robot.responsible')}
        <select
          value={form.responsible_user_id ?? ''}
          onChange={(e) => set('responsible_user_id', e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('common.none')}</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('robot.documentation')}
        <input
          type="url"
          value={form.documentation_url ?? ''}
          onChange={(e) => set('documentation_url', e.target.value || null)}
          placeholder="https://"
        />
      </label>
      <label>
        {t('robot.status')}
        <select value={form.status} onChange={(e) => set('status', e.target.value as RobotStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="span-2">
        {t('robot.description')}
        <textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value || null)} rows={3} />
      </label>
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
