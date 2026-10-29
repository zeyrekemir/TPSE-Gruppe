import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { LogForm, LogTable } from '../components'
import { ErrorBox } from '../ui'
import { useLoad } from '../util'
import { Wave } from '../Wave'
import { robotDetails } from '../options'
import { Select } from '../Select'

export default function LogsPage() {
  const { t } = useTranslation()
  const [robotId, setRobotId] = useState<number | ''>('')
  const robots = useLoad(api.robots)
  const logs = useLoad(() => api.logs({ robot_id: robotId === '' ? undefined : robotId }), [robotId])

  return (
    <section>
      <div className="page-head">
        <h1>
          <Wave text={t('nav.logs')} />
        </h1>
        <Select details={robotDetails(robots.data)} value={robotId} onChange={(e) => setRobotId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('common.all')}</option>
          {robots.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      <LogForm robots={robots.data ?? []} onDone={logs.reload} />
      <ErrorBox message={logs.error} />
      <LogTable logs={logs.data ?? []} showRobot onChange={logs.reload} />
    </section>
  )
}
