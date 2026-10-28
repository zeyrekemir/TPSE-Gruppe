import { useLocation } from 'react-router-dom'

/*
 * App background: a blueprint drawing of the same robot arm as the 3D welcome story, over an engineering
 * dot grid. Its joints carry the coloured glows the glass panels blur (the "bubbles" are joint lights).
 * The arm takes a different pose per page and eases between them (CSS `rotate` transitions on the joint
 * groups), stands still in between, and stands centred on the welcome page so the 3D arm
 * can hand over to it at the end of the scroll story.
 */

const POSES: Record<string, string> = {
  welcome: 'welcome',
  robots: 'robots',
  calendar: 'calendar',
  tickets: 'tickets',
  logs: 'logs',
  stats: 'stats',
  users: 'users',
  labels: 'robots',
}

function poseFor(pathname: string, signedIn: boolean) {
  if (!signedIn || pathname.startsWith('/welcome')) return 'welcome'
  return POSES[pathname.split('/')[1]] ?? 'robots'
}

// Link lengths in viewBox units (shoulder -> wrist), matching the 3D arm's proportions.
const L1 = 230
const L2 = 290
const L3 = 250
const L4 = 110

function Joint({ id, r, glow }: { id: string; r: number; glow: string }) {
  return (
    <>
      <circle r={300} fill={`url(#${glow})`} className="bp-glow" />
      <circle r={r + 26} className="bp-orbit" />
      <circle r={r} className="bp-joint" />
      <circle r={r - 7} className={`bp-ring bp-ring-${glow}`} />
      <text x={r + 14} y={-r - 6} className="bp-label">
        {id}
      </text>
    </>
  )
}

const link = (len: number, w: number) => (
  <rect x={-w / 2} y={-len} width={w} height={len} rx={w / 2} className="bp-link" />
)

export default function Backdrop({ signedIn }: { signedIn: boolean }) {
  const pose = poseFor(useLocation().pathname, signedIn)
  return (
    <div className="backdrop" data-pose={pose} aria-hidden>
      <svg className="blueprint" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice">
        <defs>
          {[
            ['g-cyan', 'var(--joint-1)'],
            ['g-violet', 'var(--joint-2)'],
            ['g-pink', 'var(--joint-3)'],
            ['g-indigo', 'var(--joint-4)'],
          ].map(([id, color]) => (
            <radialGradient key={id} id={id}>
              {/* style, not attributes: only CSS understands var() */}
              <stop offset="0" style={{ stopColor: color, stopOpacity: 'var(--glow-strength)' }} />
              <stop offset="0.45" style={{ stopColor: color, stopOpacity: 'calc(var(--glow-strength) * 0.35)' }} />
              <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
            </radialGradient>
          ))}
        </defs>

        <g className="bp-arm">
          {/* construction circles around the base */}
          {[180, 420, 700, 1000].map((r) => (
            <circle key={r} r={r} className="bp-construct" />
          ))}
          <rect x={-120} y={-34} width={240} height={34} rx={10} className="bp-link" />
          <rect x={-70} y={-70} width={140} height={40} rx={14} className="bp-link" />
          <g transform="translate(0 -70)">
            <g className="bp-j bp-j1">
              <Joint id="J1" r={44} glow="g-cyan" />
              {link(L1, 74)}
              <g transform={`translate(0 ${-L1})`}>
                <g className="bp-j bp-j2">
                  <Joint id="J2" r={40} glow="g-violet" />
                  {link(L2, 62)}
                  <g transform={`translate(0 ${-L2})`}>
                    <g className="bp-j bp-j3">
                      <Joint id="J3" r={34} glow="g-pink" />
                      {link(L3, 52)}
                      <g transform={`translate(0 ${-L3})`}>
                        <g className="bp-j bp-j4">
                          <Joint id="J4" r={26} glow="g-indigo" />
                          {link(L4, 40)}
                          <g transform={`translate(0 ${-L4})`}>
                            <rect x={-46} y={-16} width={92} height={16} rx={5} className="bp-link" />
                            <g className="bp-finger bp-finger-l">
                              <rect x={-40} y={-62} width={14} height={48} rx={5} className="bp-link" />
                            </g>
                            <g className="bp-finger bp-finger-r">
                              <rect x={26} y={-62} width={14} height={48} rx={5} className="bp-link" />
                            </g>
                          </g>
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </svg>
      <span className="grain" />
    </div>
  )
}
