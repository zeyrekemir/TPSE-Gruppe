import { useId } from 'react'

/**
 * PEARL logo: a robot gripper holding a pearl (the lab's name and what it does), drawn in the same square,
 * straight-edged geometry as the Orbitron headings, on a dark tile with a gradient rim like an app icon.
 * Next to it the wide wordmark.
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
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="0.5" stopColor="#c084fc" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#221a4d" />
          <stop offset="1" stopColor="#0c0a1d" />
        </linearGradient>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
        {/* Iridescent pearl: white core, lavender body, a pink and a cyan glint at the rim. */}
        <radialGradient id={`${id}-pearl`} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#efeaff" />
          <stop offset="0.72" stopColor="#c7b8ff" />
          <stop offset="0.9" stopColor="#f0abfc" />
          <stop offset="1" stopColor="#67e8f9" />
        </radialGradient>
      </defs>
      {/* Tile with a gradient rim */}
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#${id}-tile)`} />
      <rect x="3" y="3" width="58" height="58" rx="15" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="3" />
      {/* Gripper: palm and two square fingers that close in at the tips */}
      <path
        d="M24 48 L19 40 V17 H45 V40 L40 48"
        fill="none"
        stroke={`url(#${id}-steel)`}
        strokeWidth="6"
        strokeLinejoin="miter"
        strokeLinecap="square"
        className="logo-ring"
      />
      <rect x="28" y="10" width="8" height="5" rx="1.5" fill={`url(#${id}-rim)`} />
      {/* The pearl, held between the fingertips */}
      <circle cx="32" cy="36" r="9.5" fill={`url(#${id}-pearl)`} className="logo-pearl" />
      <ellipse cx="28.6" cy="32.4" rx="3.1" ry="1.9" fill="#fff" opacity="0.9" transform="rotate(-32 28.6 32.4)" />
      {/* A spark of light */}
      <path d="M38.5 27.5 l0.9 2.2 2.2 0.9 -2.2 0.9 -0.9 2.2 -0.9 -2.2 -2.2 -0.9 2.2 -0.9z" fill="#fff" />
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
        <span className="logo-word">PEARL</span>
        {tagline && <span className="logo-tag">{tagline}</span>}
      </span>
    </span>
  )
}
