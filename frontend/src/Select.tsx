import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ArmIcon, CheckIcon } from './icons'
import type { OptionDetail } from './options'
import { useDismiss, usePlacement } from './popover'

/**
 * A select in the site's own style. The native <select> stays the real control (its label points at it, it
 * carries `required`, arrow keys change it, forms and tests read it); only the browser's own list is replaced, by
 * a glass list. With `details` (e.g. robotDetails(robots)) each option also shows a line of detail and a status.
 * Opening: a click, Space, Enter, Alt+ArrowDown or F4. In the list: arrows, Home/End, typing a letter, Enter
 * picks, Escape closes.
 */
export function Select({
  details,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { details?: Record<string, OptionDetail> }) {
  const [open, setOpen] = useState(false)
  const field = useRef<HTMLSpanElement>(null)
  const select = useRef<HTMLSelectElement>(null)

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) select.current?.focus()
  }, [])

  /** Sets the native select as if the user had picked in its own list, so React's onChange runs. */
  const pick = (value: string) => {
    const el = select.current!
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
    close()
  }

  return (
    <span className={`select ${open ? 'is-open' : ''} ${className ?? ''}`} ref={field}>
      <select
        ref={select}
        {...props}
        onMouseDown={(e) => {
          props.onMouseDown?.(e)
          if (props.disabled || e.button !== 0) return
          // Our list instead of the browser's.
          e.preventDefault()
          select.current?.focus()
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          props.onKeyDown?.(e)
          if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4' || e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      />
      {open && field.current && select.current && (
        <List anchor={field.current} select={select.current} details={details} onPick={pick} onClose={close} />
      )}
    </span>
  )
}

function List({
  anchor,
  select,
  details,
  onPick,
  onClose,
}: {
  anchor: HTMLElement
  select: HTMLSelectElement
  details?: Record<string, OptionDetail>
  onPick: (value: string) => void
  onClose: (refocus?: boolean) => void
}) {
  const { t } = useTranslation()
  // The options as the native select has them (so the list always matches what the form submits).
  const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.text, disabled: o.disabled }))
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === select.value)))
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const place = usePlacement(anchor, panel, details ? 300 : 0)
  const closeOutside = useCallback(() => onClose(false), [onClose])
  useDismiss(anchor, panel, closeOutside)

  // Focus the list on opening; keep the active option in view.
  useEffect(() => list.current?.focus(), [])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const move = (from: number, step: number) => {
    let i = from
    for (let n = 0; n < options.length; n++) {
      i = (i + step + options.length) % options.length
      if (!options[i].disabled) return i
    }
    return from
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((a) => move(a, 1))
    else if (e.key === 'ArrowUp') setActive((a) => move(a, -1))
    else if (e.key === 'Home') setActive(move(-1, 1))
    else if (e.key === 'End') setActive(move(options.length, -1))
    else if (e.key === 'Enter' || e.key === ' ') {
      if (!options[active]?.disabled) onPick(options[active].value)
    } else if (e.key === 'Escape') onClose()
    else if (e.key === 'Tab') return onClose()
    else if (e.key.length === 1) {
      // Type a letter to jump to the next option starting with it.
      const k = e.key.toLowerCase()
      const i = options.findIndex((o, n) => n > active && o.label.toLowerCase().startsWith(k))
      const j = i >= 0 ? i : options.findIndex((o) => o.label.toLowerCase().startsWith(k))
      if (j >= 0) setActive(j)
    } else return
    e.preventDefault()
    e.stopPropagation()
  }

  // The list's name: the field's label without the option texts inside it.
  const labelEl = select.labels?.[0]
  const label =
    select.getAttribute('aria-label') ??
    (labelEl ? Array.from(labelEl.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim() : undefined)

  return createPortal(
    <div
      ref={panel}
      className={`select-panel ${details ? 'rich' : ''} ${place?.above ? 'above' : ''}`}
      style={place ? { top: place.top, left: place.left, minWidth: place.width } : { visibility: 'hidden' }}
    >
      <ul
        ref={list}
        role="listbox"
        aria-label={label}
        tabIndex={-1}
        aria-activedescendant={`opt-${active}`}
        onKeyDown={onKey}
      >
        {options.map((o, i) => {
          const d = details?.[o.value]
          const selected = o.value === select.value
          return (
            <li
              key={o.value}
              id={`opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={selected}
              aria-disabled={o.disabled || undefined}
              className={`${i === active ? 'active' : ''} ${selected ? 'selected' : ''}`}
              onPointerEnter={() => !o.disabled && setActive(i)}
              onClick={() => !o.disabled && onPick(o.value)}
            >
              {details && (
                <span className={`select-badge ${d?.status ? `s-${d.status}` : 'none'}`} aria-hidden="true">
                  {d ? <ArmIcon /> : '–'}
                </span>
              )}
              <span className="select-text">
                <span className="select-label">{o.label}</span>
                {d?.sub && <span className="select-sub">{d.sub}</span>}
              </span>
              {d?.status && <span className={`select-status s-${d.status}`}>{t(`status.${d.status}`)}</span>}
              <span className="select-check" aria-hidden="true">
                {selected && <CheckIcon />}
              </span>
            </li>
          )
        })}
      </ul>
    </div>,
    document.body,
  ) as ReactNode
}
