import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { useDismiss, usePlacement } from './popover'

/**
 * A date-and-time field in the site's own style. The value is the same as a native
 * <input type="datetime-local"> ("YYYY-MM-DDTHH:mm", local time), and the native input stays the real form
 * control: it can be typed into, it carries `required`, and its label points at it. Only the browser's own grey
 * pop-up is replaced, by a glass calendar with hour and minute columns.
 *
 * The pop-up is a modal-less dialog rendered at the top of the page (a portal), so no card can cover it and its
 * glass blurs the page behind it. Keyboard: arrows move the day, PageUp/PageDown the month, Enter picks,
 * Escape closes; Alt+ArrowDown or F4 in the field opens it, as for the native picker.
 */
export function DateTimeField({
  value,
  onChange,
  required,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-GB' : 'de-DE'
  const [open, setOpen] = useState(false)
  const field = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) input.current?.focus()
  }, [])

  return (
    <div className={`dtp ${open ? 'is-open' : ''}`} ref={field}>
      <input
        ref={input}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        onClick={(e) => {
          // Our pop-up instead of the browser's.
          e.preventDefault()
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      />
      <button
        type="button"
        className="dtp-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('picker.open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        tabIndex={-1}
      >
        <CalendarIcon />
      </button>
      {open && field.current && (
        <Picker anchor={field.current} value={value} locale={locale} onPick={onChange} onClose={close} />
      )}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const toValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** The value as a Date; with no value, the next quarter hour from now. */
function parse(value: string) {
  const d = value ? new Date(value) : new Date()
  if (!value || Number.isNaN(d.getTime())) {
    const now = new Date()
    now.setSeconds(0, 0)
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15)
    return now
  }
  return d
}

function Picker({
  anchor,
  value,
  locale,
  onPick,
  onClose,
}: {
  anchor: HTMLElement
  value: string
  locale: string
  onPick: (value: string) => void
  onClose: (refocus?: boolean) => void
}) {
  const { t } = useTranslation()
  const selected = parse(value)
  const today = new Date()
  // The month shown and the day the keyboard is on; both follow the selection when it changes.
  const [focus, setFocus] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()))
  const panel = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)

  const place = usePlacement(anchor, panel)
  const closeOutside = useCallback(() => onClose(false), [onClose])
  useDismiss(anchor, panel, closeOutside)

  // Keyboard focus starts on the selected day.
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
  }, [])

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    // 2024-01-01 was a Monday: the week starts on Monday, as in Germany.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
  }, [locale])
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(focus)

  // Six weeks from the Monday on or before the 1st.
  const first = new Date(focus.getFullYear(), focus.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))

  const pick = (day: Date, hours = selected.getHours(), minutes = selected.getMinutes()) => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes)
    onPick(toValue(d))
    setFocus(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
  }
  // Moving by keyboard (or the month buttons) puts focus on the new day as soon as it is rendered.
  const follow = useRef(false)
  const moveFocus = (days: number, months = 0, keyboard = true) => {
    follow.current = keyboard
    setFocus(new Date(focus.getFullYear(), focus.getMonth() + months, focus.getDate() + days))
  }
  useEffect(() => {
    if (!follow.current) return
    follow.current = false
    grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
  }, [focus])
  const onGridKey = (e: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [-7, 0],
      ArrowDown: [7, 0],
      PageUp: [0, -1],
      PageDown: [0, 1],
    }
    const m = moves[e.key]
    if (m) {
      e.preventDefault()
      moveFocus(...m)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const offset = (focus.getDay() + 6) % 7
      moveFocus(e.key === 'Home' ? -offset : 6 - offset)
    }
  }

  // Minutes in steps of five, plus the current value if it falls in between.
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5)
  if (!minutes.includes(selected.getMinutes())) {
    minutes.push(selected.getMinutes())
    minutes.sort((a, b) => a - b)
  }
  const hourList = useRef<HTMLDivElement>(null)
  const minuteList = useRef<HTMLDivElement>(null)
  // Scroll the chosen hour and minute to the middle of their columns.
  useEffect(() => {
    for (const list of [hourList.current, minuteList.current]) {
      const on = list?.querySelector<HTMLElement>('[aria-selected="true"]')
      if (list && on) list.scrollTop = on.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2
    }
  }, [value])

  const human = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(selected)

  return createPortal(
    <div
      ref={panel}
      className={`dtp-panel ${place?.above ? 'above' : ''}`}
      role="dialog"
      aria-label={t('picker.title')}
      style={place ? { top: place.top, left: place.left } : { visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="dtp-cal">
        <div className="dtp-head">
          <strong aria-live="polite">{monthTitle}</strong>
          <span className="dtp-nav">
            <button type="button" onClick={() => moveFocus(0, -1, false)} aria-label={t('picker.prev')}>
              <ChevronLeftIcon />
            </button>
            <button type="button" onClick={() => moveFocus(0, 1, false)} aria-label={t('picker.next')}>
              <ChevronRightIcon />
            </button>
          </span>
        </div>
        <div className="dtp-week" aria-hidden="true">
          {weekdays.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="dtp-days" ref={grid} role="grid" aria-label={monthTitle} onKeyDown={onGridKey}>
          {days.map((d) => {
            const outside = d.getMonth() !== focus.getMonth()
            const isSelected = value !== '' && sameDay(d, selected)
            return (
              <button
                key={d.getTime()}
                type="button"
                role="gridcell"
                className={`${outside ? 'outside' : ''} ${isSelected ? 'selected' : ''} ${sameDay(d, today) ? 'today' : ''}`}
                tabIndex={sameDay(d, focus) ? 0 : -1}
                aria-selected={isSelected}
                aria-current={sameDay(d, today) ? 'date' : undefined}
                aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(d)}
                onClick={() => pick(d)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    pick(d)
                  }
                }}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
      </div>
      <div className="dtp-time">
        <span className="dtp-time-title">{t('picker.time')}</span>
        <div className="dtp-cols">
          <div className="dtp-col" ref={hourList} role="listbox" aria-label={t('picker.hour')}>
            {Array.from({ length: 24 }, (_, h) => (
              <button
                key={h}
                type="button"
                role="option"
                aria-selected={h === selected.getHours()}
                onClick={() => pick(selected, h)}
              >
                {pad(h)}
              </button>
            ))}
          </div>
          <span className="dtp-colon" aria-hidden="true">
            :
          </span>
          <div className="dtp-col" ref={minuteList} role="listbox" aria-label={t('picker.minute')}>
            {minutes.map((m) => (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={m === selected.getMinutes()}
                onClick={() => pick(selected, selected.getHours(), m)}
              >
                {pad(m)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="dtp-foot">
        <span className="dtp-summary">
          {value ? (
            <>
              {human} · <b>{pad(selected.getHours())}:{pad(selected.getMinutes())}</b>
            </>
          ) : (
            t('picker.none')
          )}
        </span>
        <button
          type="button"
          className="dtp-link"
          onClick={() => {
            const now = new Date()
            pick(now, now.getHours(), now.getMinutes())
          }}
        >
          {t('picker.now')}
        </button>
        <button type="button" className="dtp-done" onClick={() => onClose()}>
          {t('picker.done')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
