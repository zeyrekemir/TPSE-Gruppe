import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { TicketForm, TicketItem } from '../components'
import { ErrorBox } from '../ui'
import { useLoad } from '../util'
import { Wave } from '../Wave'
import { robotDetails } from '../options'
import { Select } from '../Select'

export default function TicketsPage() {
  const { t } = useTranslation()
  const [openOnly, setOpenOnly] = useState(true)
  const [robotId, setRobotId] = useState<number | ''>('')
  const robots = useLoad(api.robots)
  const users = useLoad(api.users)
  const tickets = useLoad(
    () => api.tickets({ open_only: openOnly, robot_id: robotId === '' ? undefined : robotId }),
    [openOnly, robotId],
  )

  return (
    <section>
      <div className="page-head">
        <h1>
          <Wave text={t('nav.tickets')} />
        </h1>
        <div className="actions">
          <Select details={robotDetails(robots.data)} value={robotId} onChange={(e) => setRobotId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('common.all')}</option>
            {robots.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <label className="checkbox">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            {t('ticket.openOnly')}
          </label>
        </div>
      </div>
      <TicketForm robots={robots.data ?? []} onDone={tickets.reload} />
      <ErrorBox message={tickets.error} />
      {tickets.data?.length === 0 && <p className="muted">{t('ticket.noTickets')}</p>}
      <ul className="plain">
        {tickets.data?.map((tk) => (
          <TicketItem key={tk.id} ticket={tk} users={users.data ?? []} onChange={tickets.reload} />
        ))}
      </ul>
    </section>
  )
}
