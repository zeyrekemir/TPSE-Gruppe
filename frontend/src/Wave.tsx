import { Fragment, type CSSProperties } from 'react'

/**
 * Heading text whose letters rise and fall gently one after another (CSS `.wave`, transforms only, so it costs
 * no repaint). Each letter paints its own slice of the heading's gradient, so gradient headings stay continuous.
 * Words keep together when lines wrap; screen readers get the plain text. Still when motion is off.
 */
export function Wave({ text }: { text: string }) {
  const words = text.trim().split(/\s+/)
  const n = words.join('').length
  let i = 0
  return (
    <span className="wave">
      <span className="sr-only">{text}</span>
      {words.map((word, w) => (
        <Fragment key={w}>
          {w > 0 && ' '}
          <span className="wave-word" aria-hidden="true">
            {Array.from(word).map((c) => (
              <span key={i} className="wave-char" style={{ '--i': i++, '--n': n } as CSSProperties}>
                {c}
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  )
}
