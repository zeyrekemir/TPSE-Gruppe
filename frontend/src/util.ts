import { useCallback, useEffect, useRef, useState } from 'react'

/** Load data on mount and whenever `deps` change; `reload` refetches. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps)
  const reload = useCallback(() => {
    load()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e.message))
  }, [load])
  useEffect(reload, [reload])
  return { data, error, reload }
}

export function formatDateTime(iso: string, lng: string) {
  return new Date(iso).toLocaleString(lng === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Value for <input type="datetime-local"> in the browser's timezone. */
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Local datetime-input value to an ISO string with timezone, as the API requires. */
export function fromLocalInput(value: string) {
  return new Date(value).toISOString()
}

/** Call `fn` every `ms` while the tab is visible (live data without a socket). */
export function useInterval(fn: () => void, ms: number) {
  const saved = useRef(fn)
  saved.current = fn
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) saved.current()
    }, ms)
    return () => clearInterval(id)
  }, [ms])
}

