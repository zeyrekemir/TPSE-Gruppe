import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export type Placement = { top: number; left: number; above: boolean; width: number }

/**
 * Where a pop-up (rendered at the top of the page through a portal) goes for the field it belongs to: below it,
 * or above when there is no room. The side is decided once, on opening, so it never flips while the page
 * scrolls. Placed in page coordinates, the browser scrolls it together with the page in the same frame, with no
 * script in between; only a resize or scrolling inside an inner scroll box re-places it.
 */
export function usePlacement(anchor: HTMLElement, panel: RefObject<HTMLElement | null>, minWidth = 0) {
  const [place, setPlace] = useState<Placement | null>(null)
  const side = useRef<'below' | 'above' | null>(null)
  useLayoutEffect(() => {
    const position = () => {
      const r = anchor.getBoundingClientRect()
      const width = Math.max(minWidth, r.width)
      const h = panel.current?.offsetHeight ?? 380
      const w = Math.max(width, panel.current?.offsetWidth ?? 0)
      side.current ??= r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0 ? 'above' : 'below'
      const above = side.current === 'above'
      setPlace({
        top: window.scrollY + (above ? r.top - 8 - h : r.bottom + 8),
        left: window.scrollX + Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
        above,
        width,
      })
    }
    position()
    const onScroll = (e: Event) => {
      if (e.target !== document && e.target !== document.documentElement) position()
    }
    window.addEventListener('resize', position)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [anchor, panel, minWidth])
  return place
}

/** Calls `onClose` on a press anywhere outside the field and its pop-up. */
export function useDismiss(anchor: HTMLElement, panel: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!panel.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [anchor, panel, onClose])
}
