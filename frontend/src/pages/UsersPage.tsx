import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Role } from '../api'
import { useAuth } from '../auth'
import { ErrorBox } from '../ui'
import { useLoad } from '../util'

export default function UsersPage() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const users = useLoad(api.users)
  const [form, setForm] = useState({ username: '', display_name: '', email: '', password: '', role: 'member' as Role })
  const [error, setError] = useState<string | null>(null)

  async function create(e: FormEvent) {
    e.preventDefault()
    try {
      await api.createUser({ ...form, email: form.email || undefined })
      setForm({ username: '', display_name: '', email: '', password: '', role: 'member' })
      setError(null)
      users.reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function update(id: number, data: { role?: Role; is_active?: boolean }) {
    try {
      await api.updateUser(id, data)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
    users.reload()
  }

  return (
    <section>
      <h1>{t('nav.users')}</h1>
      <form className="card form-grid" onSubmit={create}>
        <h3 className="span-2">{t('user.new')}</h3>
        <label>
          {t('user.username')}
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        </label>
        <label>
          {t('user.displayName')}
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
        </label>
        <label>
          {t('user.email')}
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          {t('user.password')}
          <input
            type="password"
            value={form.password}
            minLength={8}
            autoComplete="new-password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>
        <label>
          {t('user.role')}
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="member">{t('user.roles.member')}</option>
            <option value="admin">{t('user.roles.admin')}</option>
          </select>
        </label>
        <div className="actions span-2">
          <button type="submit">{t('common.add')}</button>
        </div>
      </form>
      <ErrorBox message={error ?? users.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('user.username')}</th>
              <th>{t('user.displayName')}</th>
              <th>{t('user.email')}</th>
              <th>{t('user.source')}</th>
              <th>{t('user.role')}</th>
              <th>{t('user.active')}</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'inactive'}>
                <td>{u.username}</td>
                <td>{u.display_name}</td>
                <td>{u.email ?? t('common.none')}</td>
                <td>{u.auth_source.toUpperCase()}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={u.id === me?.id}
                    onChange={(e) => update(u.id, { role: e.target.value as Role })}
                  >
                    <option value="member">{t('user.roles.member')}</option>
                    <option value="admin">{t('user.roles.admin')}</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={u.is_active}
                    disabled={u.id === me?.id}
                    onChange={(e) => update(u.id, { is_active: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
