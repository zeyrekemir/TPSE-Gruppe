import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Robot, type RobotInput, type RobotStatus, type User } from '../api'
import { ErrorBox } from '../ui'
import { useLoad } from '../util'
import { Select } from '../Select'

const STATUSES: RobotStatus[] = ['available', 'maintenance', 'defect', 'retired']

// What the robot's responsible person may change (mirrors RESPONSIBLE_MAY_EDIT in backend/app/routers/robots.py).
const RESPONSIBLE_FIELDS = ['status', 'location', 'description', 'firmware', 'operating_system', 'equipment'] as const

/** Create or edit a robot. Admins edit everything; with `limited` (the responsible person) only status,
 * location, description and the specification. */
export default function RobotForm({
  robot,
  limited = false,
  onDone,
  onCancel,
}: {
  robot?: Robot
  limited?: boolean
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
    firmware: robot?.firmware ?? null,
    operating_system: robot?.operating_system ?? null,
    equipment: robot?.equipment ?? [],
  })
  // Equipment is typed one item per line.
  const [equipment, setEquipment] = useState((robot?.equipment ?? []).join('\n'))
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof RobotInput>(key: K, value: RobotInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const data = { ...form, equipment: equipment.split('\n').map((s) => s.trim()).filter(Boolean) }
      const allowed = limited ? Object.fromEntries(RESPONSIBLE_FIELDS.map((k) => [k, data[k]])) : data
      onDone(robot ? await api.updateRobot(robot.id, allowed) : await api.createRobot(data))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <label>
        {t('common.name')}
        <input value={form.name} onChange={(e) => set('name', e.target.value)} required disabled={limited} />
      </label>
      <label>
        {t('robot.type')}
        <input
          value={form.type}
          onChange={(e) => set('type', e.target.value)}
          placeholder="Franka Panda"
          required
          disabled={limited}
        />
      </label>
      <label>
        {t('robot.location')}
        <input value={form.location} onChange={(e) => set('location', e.target.value)} required />
      </label>
      <label>
        {t('robot.responsible')}
        <Select
          value={form.responsible_user_id ?? ''}
          disabled={limited}
          onChange={(e) => set('responsible_user_id', e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('common.none')}</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name}
            </option>
          ))}
        </Select>
      </label>
      <label>
        {t('robot.documentation')}
        <input
          type="url"
          disabled={limited}
          value={form.documentation_url ?? ''}
          onChange={(e) => set('documentation_url', e.target.value || null)}
          placeholder="https://"
        />
      </label>
      <label>
        {t('robot.status')}
        <Select value={form.status} onChange={(e) => set('status', e.target.value as RobotStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
      </label>
      <label>
        {t('robot.firmware')}
        <input
          value={form.firmware ?? ''}
          onChange={(e) => set('firmware', e.target.value || null)}
          placeholder="5.6.0"
          maxLength={128}
        />
      </label>
      <label>
        {t('robot.os')}
        <input
          value={form.operating_system ?? ''}
          onChange={(e) => set('operating_system', e.target.value || null)}
          placeholder="Ubuntu 22.04"
          maxLength={128}
        />
      </label>
      <label className="span-2">
        {t('robot.equipment')}
        <textarea
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          rows={3}
          placeholder={t('robot.equipmentHint')}
        />
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
