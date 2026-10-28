import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { api, type Robot } from '../api'
import { LogoMark } from '../Logo'
import { ErrorBox } from '../ui'
import { useLoad } from '../util'

function robotUrl(id: number) {
  return `${window.location.origin}/robots/${id}`
}

function QrSvg({ text }: { text: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000', light: '#0000' } })
      .then(setSvg)
      .catch(() => setSvg(''))
  }, [text])
  // The SVG comes from the QR library, built from our own URL.
  return <span className="qr" role="img" aria-label={text} dangerouslySetInnerHTML={{ __html: svg }} />
}

function Label({ robot }: { robot: Robot }) {
  const { t } = useTranslation()
  const url = robotUrl(robot.id)
  return (
    <article className="label">
      <QrSvg text={url} />
      <div className="label-text">
        <span className="label-brand">
          <LogoMark size={18} /> PEARL Robot Hub
        </span>
        <strong>{robot.name}</strong>
        <span>{robot.type}</span>
        <span>{robot.location}</span>
        <small>{t('labels.scan')}</small>
        <small className="label-url">{url.replace(/^https?:\/\//, '')}</small>
      </div>
    </article>
  )
}

/** Printable QR labels: one robot (/robots/:id/label) or all of them (/labels). */
export default function LabelsPage() {
  const { t } = useTranslation()
  const id = useParams().id
  const { data: robots, error } = useLoad<Robot[]>(
    () => (id ? api.robot(Number(id)).then((r) => [r]) : api.robots()),
    [id],
  )

  return (
    <section>
      <div className="page-head no-print">
        <div>
          <p>
            <Link to={id ? `/robots/${id}` : '/robots'}>← {t('nav.robots')}</Link>
          </p>
          <h1>{id ? t('labels.printOne') : t('labels.print')}</h1>
          <p className="muted">{t('labels.hint')}</p>
        </div>
        <button onClick={() => window.print()}>{t('labels.printNow')}</button>
      </div>
      <ErrorBox message={error} />
      <div className="labels">{robots?.map((r) => <Label key={r.id} robot={r} />)}</div>
    </section>
  )
}
