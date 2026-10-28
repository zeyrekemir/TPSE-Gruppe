import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Small, decorative previews of the hub's own screens for the welcome story's feature captions: the inventory
 * table, the live status board, the booking calendar and the maintenance log. Rows build up one by one as the
 * caption fades in (`--o`, set by the welcome page, is the caption's opacity).
 */
export function FeaturePreview({ feature }: { feature: 'f1' | 'f2' | 'f3' | 'f4' }) {
  const { t } = useTranslation()
  const row = (r: number) => ({ '--r': r }) as CSSProperties
  return (
    <div className={`fp fp-${feature}`} aria-hidden="true">
      <div className="fp-bar">
        <i />
        <i />
        <i />
        <span>pearl.tu-darmstadt.de</span>
      </div>
      {feature === 'f1' && (
        <div className="fp-body">
          <div className="fp-head fp-row" style={row(0)}>
            <span>{t('common.name')}</span>
            <span>{t('robot.location')}</span>
            <span>{t('robot.responsible')}</span>
          </div>
          {[
            ['Franka FR3', 'S2|02 · A112', 'A. Becker'],
            ['xArm 6', 'S2|02 · A114', 'J. Wolf'],
            ['Tiago++', 'S2|02 · Hall', 'M. Kaya'],
          ].map(([name, place, who], i) => (
            <div key={name} className="fp-row" style={row(i + 1)}>
              <span className="fp-robot">
                <b className={`fp-avatar a${i}`} />
                {name}
              </span>
              <span>{place}</span>
              <span>{who}</span>
            </div>
          ))}
        </div>
      )}
      {feature === 'f2' && (
        <div className="fp-body fp-tiles">
          {(
            [
              ['Franka FR3', 'available', '98%'],
              ['xArm 6', 'reserved', '71%'],
              ['Tiago++', 'maintenance', '—'],
              ['UR5e', 'available', '64%'],
            ] as const
          ).map(([name, status, battery], i) => (
            <div key={name} className={`fp-tile fp-row s-${status}`} style={row(i)}>
              <span className="fp-dot" />
              <b>{name}</b>
              <small>{t(`status.${status}`)}</small>
              <span className="fp-meter">
                <i style={{ width: battery === '—' ? '0%' : battery }} />
              </span>
            </div>
          ))}
        </div>
      )}
      {feature === 'f3' && (
        <div className="fp-body fp-cal">
          {['08', '10', '12', '14', '16'].map((h, i) => (
            <span key={h} className="fp-hour" style={{ gridRow: i + 2 }}>
              {h}
            </span>
          ))}
          {t('stats.weekdays')
            .split(',')
            .slice(0, 5)
            .map((d, i) => (
              <span key={d} className="fp-day" style={{ gridColumn: i + 2 }}>
                {d}
              </span>
            ))}
          <b className="fp-slot fp-row" style={{ ...row(0), gridColumn: 2, gridRow: '2 / 4' }}>Franka</b>
          <b className="fp-slot alt fp-row" style={{ ...row(1), gridColumn: 4, gridRow: '3 / 5' }}>xArm</b>
          <b className="fp-slot clash fp-row" style={{ ...row(2), gridColumn: 3, gridRow: '2 / 4' }}>
            {t('status.reserved')}
          </b>
          <b className="fp-slot next fp-row" style={{ ...row(3), gridColumn: 3, gridRow: '4 / 6' }}>
            {t('story.ui.nextFree')}
          </b>
        </div>
      )}
      {feature === 'f4' && (
        <div className="fp-body fp-log">
          {(
            [
              ['fault', t('story.ui.fault'), 'Tiago++', '09:12'],
              ['work', t('story.ui.fix'), 'Tiago++', '11:40'],
              ['ok', t('story.ui.run'), 'Franka FR3', '14:05'],
            ] as const
          ).map(([kind, text, robot, time], i) => (
            <div key={kind} className={`fp-entry fp-row k-${kind}`} style={row(i)}>
              <span className="fp-pin" />
              <span>
                <b>{text}</b>
                <small>
                  {robot} · {time}
                </small>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
