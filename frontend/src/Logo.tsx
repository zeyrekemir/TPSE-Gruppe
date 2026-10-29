import { useId } from 'react'
import { Wave } from './Wave'

/**
 * PEARL logo, in the manner of industrial robot brands (one flat geometric symbol, readable in one colour):
 * the "P" of the Orbitron headings, drawn exactly in their style, with its bowl as a robot joint and the pearl
 * at the joint's axis.
 * White on a violet tile; next to it the wide wordmark.
 */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`logo-mark ${className ?? ''}`}
      role="img"
      aria-label="PEARL"
    >
      <defs>
        {/* The site's own gradient (--grad in index.css): indigo, violet, pink */}
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <radialGradient id={`${id}-pearl`} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#f3efff" />
          <stop offset="1" stopColor="#d9ccff" />
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${id}-tile)`} />
      {/* A soft top sheen, like a lacquered badge */}
      <path d="M4 20 Q4 4 20 4 H44 Q60 4 60 20 V24 Q32 34 4 24 Z" fill="#fff" opacity="0.1" />
      {/* The heading font's own P (Orbitron Black, measured from the glyph): a straight stem with square corners
          and a square bowl rounded only on the outside right. Its counter is a gripper's mouth: two jaws closing
          from the stem, with a round seat at the tip that holds the pearl. */}
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M12 12 H45.2 A6.8 6.8 0 0 1 52 18.8 V32 A6.8 6.8 0 0 1 45.2 38.8 H20.6 V52 H12 Z
           M20.6 21.4 L31.8 23.6 H33.5 A4.7 4.7 0 1 1 33.5 27.2 H31.8 L20.6 29.4 Z"
      />
      {/* Grip pads on the jaws, in the tile colour */}
      <g fill={`url(#${id}-tile)`}>
        <rect x="35.4" y="18.6" width="4.4" height="1.6" rx="0.5" />
        <rect x="35.4" y="30.6" width="4.4" height="1.6" rx="0.5" />
      </g>
      {/* The pearl, held in the jaws */}
      <circle cx="37.6" cy="25.4" r="3.2" fill={`url(#${id}-pearl)`} className="logo-pearl" />
    </svg>
  )
}

export function Logo({
  size = 40,
  tagline = 'Robot Hub',
  className,
}: {
  size?: number
  tagline?: string | null
  className?: string
}) {
  return (
    <span className={`logo ${className ?? ''}`} style={{ fontSize: size * 0.5 }}>
      <LogoMark size={size} />
      <span className="logo-text">
        <span className="logo-word">
          <Wave text="PEARL" />
        </span>
        {tagline && <span className="logo-tag">{tagline}</span>}
      </span>
    </span>
  )
}
