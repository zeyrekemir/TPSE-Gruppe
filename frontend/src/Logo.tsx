import { useId } from 'react'

/**
 * PEARL logo: a pearl held in a glowing joint ring (the same ring that lights up the arm's joints in the intro),
 * next to a wide geometric wordmark.
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
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <radialGradient id={`${id}-pearl`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#ece8ff" />
          <stop offset="0.8" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#8b5cf6" />
        </radialGradient>
      </defs>
      {/* Joint ring, open at the top-right like a gripper about to close */}
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        stroke={`url(#${id}-ring)`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="138 26"
        transform="rotate(-38 32 32)"
        className="logo-ring"
      />
      <circle cx="32" cy="32" r="13" fill={`url(#${id}-pearl)`} className="logo-pearl" />
      <ellipse cx="27.5" cy="26.5" rx="4.2" ry="2.6" fill="#fff" opacity="0.85" transform="rotate(-30 27.5 26.5)" />
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
