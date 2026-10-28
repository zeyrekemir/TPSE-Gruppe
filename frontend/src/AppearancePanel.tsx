import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppearance } from './appearance'
import { MoonIcon, SlidersIcon, SunIcon } from './icons'
import { sound } from './sound'

/** Popover with theme, glass transparency/blur and intro settings. */
export default function AppearancePanel({ onReplayIntro }: { onReplayIntro: () => void }) {
  const { t } = useTranslation()
  const { appearance, update, reset } = useAppearance()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="appearance" ref={ref}>
      <button
        className="icon-btn"
        aria-label={t('appearance.title')}
        title={t('appearance.title')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <SlidersIcon />
      </button>
      {open && (
        <div className="appearance-panel glass-strong" role="dialog" aria-label={t('appearance.title')}>
          <h3>{t('appearance.title')}</h3>

          <div className="segmented wide" role="group" aria-label={t('appearance.theme')}>
            <button className={appearance.theme === 'light' ? 'on' : ''} onClick={() => update({ theme: 'light' })}>
              <SunIcon /> {t('appearance.light')}
            </button>
            <button className={appearance.theme === 'dark' ? 'on' : ''} onClick={() => update({ theme: 'dark' })}>
              <MoonIcon /> {t('appearance.dark')}
            </button>
          </div>

          <label className="range">
            <span>
              {t('appearance.opacity')} <output>{appearance.opacity}%</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={appearance.opacity}
              onChange={(e) => update({ opacity: Number(e.target.value) })}
            />
            <small className="range-ends">
              <span>{t('appearance.clear')}</span>
              <span>{t('appearance.solid')}</span>
            </small>
          </label>

          <label className="range">
            <span>
              {t('appearance.blur')} <output>{appearance.blur}px</output>
            </span>
            <input
              type="range"
              min={0}
              max={40}
              value={appearance.blur}
              onChange={(e) => update({ blur: Number(e.target.value) })}
            />
          </label>

          <label className="checkbox">
            <input type="checkbox" checked={appearance.motion} onChange={(e) => update({ motion: e.target.checked })} />
            {t('appearance.motion')}
          </label>

          <label className="checkbox">
            <input type="checkbox" checked={appearance.intro} onChange={(e) => update({ intro: e.target.checked })} />
            {t('appearance.intro')}
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={appearance.sound}
              onChange={(e) => {
                update({ sound: e.target.checked })
                sound.setEnabled(e.target.checked)
                if (e.target.checked) {
                  sound.unlock()
                  sound.success()
                }
              }}
            />
            {t('appearance.sound')}
          </label>

          <div className="actions">
            <button
              className="secondary"
              onClick={() => {
                setOpen(false)
                onReplayIntro()
              }}
            >
              {t('appearance.replay')}
            </button>
            <button className="link" onClick={reset}>
              {t('appearance.reset')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
