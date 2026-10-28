import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LogoMark } from '../Logo'
import { BEATS, beatOpacity, clamp01, sceneTimeAt, type Beat } from './timeline'

/*
 * Scroll-driven welcome story (in the style of Apple's product pages): a tall section pins a full-screen
 * 3D stage, and the scroll position inside it scrubs the animation. Scrolling back rewinds it.
 * How scroll progress maps to scene time and text beats lives in timeline.ts.
 */

function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/** Dev only: `?introAt=2.5` pins the scene at 2.5 s to inspect one frame. */
function debugFreeze() {
  if (!import.meta.env.DEV) return undefined
  const at = new URLSearchParams(location.search).get('introAt')
  return at === null ? undefined : Number(at)
}

/** Typical time between frames on this display (8.3 ms at 120 Hz, 16.7 ms at 60 Hz). */
function measureFrameInterval(frames = 12): Promise<number> {
  return new Promise((resolve) => {
    const stamps: number[] = []
    const step = (t: number) => {
      stamps.push(t)
      if (stamps.length <= frames) return requestAnimationFrame(step)
      const gaps = stamps.slice(1).map((s, i) => s - stamps[i]).sort((a, b) => a - b)
      resolve(Math.min(1000 / 30, Math.max(1000 / 240, gaps[gaps.length >> 1])))
    }
    requestAnimationFrame(step)
    setTimeout(() => resolve(1000 / 60), 500) // hidden tabs don't fire rAF
  })
}

export default function WelcomePage({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const stageRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const beatRefs = useRef<Partial<Record<Beat, HTMLElement | null>>>({})
  const hintRef = useRef<HTMLElement>(null)
  const progress = useRef(0)
  // Names printed on the 3D modules (read once: the scene is built once per visit).
  const featureNames = useRef((['f1', 'f2', 'f3', 'f4'] as const).map((f) => t(`story.${f}.title`))).current

  useEffect(() => {
    // The story always starts at its beginning, not where the browser last left the scroll position.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
    requestAnimationFrame(() => window.scrollTo(0, 0)) // after any restore the browser still applies
    const stage = stageRef.current!
    let target = 0
    let raf = 0
    let last = performance.now()
    let visible = true
    let scene: { stop: () => void; setActive: (a: boolean) => void } | undefined
    let cancelled = false

    const readScroll = () => {
      const rect = stage.getBoundingClientRect()
      const span = rect.height - window.innerHeight
      target = span > 0 ? clamp01(-rect.top / span) : 1
    }

    const paint = (p: number) => {
      for (const [name, range] of Object.entries(BEATS) as [Beat, readonly [number, number]][]) {
        const el = beatRefs.current[name]
        if (!el) continue
        const o = beatOpacity(p, range)
        el.style.opacity = String(o)
        el.style.visibility = o > 0.001 ? 'visible' : 'hidden'
        // Slide up as it comes in, keep drifting up as it leaves (the Apple "parallax caption" feel).
        const mid = (range[0] + range[1]) / 2
        el.style.setProperty('--shift', `${(mid - p) * 160}px`)
      }
      if (hintRef.current) hintRef.current.style.opacity = String(1 - clamp01(p / 0.04))
      // Hand-over: in the last stretch the 3D arm and the dark stage fade out, revealing the blueprint arm
      // of the app background standing in the same spot, just before the sign-in form scrolls in.
      const out = clamp01((p - 0.965) / 0.035) // short: a long fade leaves the arm looking washed out
      stage.style.setProperty('--canvas-o', String(1 - out))
      stage.style.setProperty('--stage-o', String(1 - out * 0.85))
    }

    // Eased follow: displayed progress chases the scroll position, frame-rate independent.
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      progress.current += (target - progress.current) * (1 - Math.exp(-dt * 9))
      if (Math.abs(target - progress.current) < 0.0005) progress.current = target
      paint(progress.current)
      raf = visible ? requestAnimationFrame(loop) : 0
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      scene?.setActive(visible)
      if (visible && !raf) {
        last = performance.now()
        raf = requestAnimationFrame(loop)
      }
    })
    io.observe(stage)

    readScroll()
    progress.current = target
    paint(target)
    raf = requestAnimationFrame(loop)
    window.addEventListener('scroll', readScroll, { passive: true })
    window.addEventListener('resize', readScroll)

    if (canvasRef.current && webglAvailable()) {
      // The 3D code is only downloaded when the story is shown; meanwhile measure the refresh rate.
      Promise.all([import('./scene'), measureFrameInterval()]).then(([{ runIntroScene }, frameBudgetMs]) => {
        if (cancelled || !canvasRef.current) return
        scene = runIntroScene(canvasRef.current, () => stage.classList.add('story-ready'), {
          freezeAt: debugFreeze(),
          frameBudgetMs,
          getTime: () => sceneTimeAt(progress.current),
          labels: featureNames,
        })
        scene.setActive(visible)
      })
    } else {
      stage.classList.add('story-ready', 'story-no-3d')
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('scroll', readScroll)
      window.removeEventListener('resize', readScroll)
      scene?.stop()
    }
  }, [featureNames]) // stable (kept in a ref), so the scene is still built only once

  const beat = (name: Beat) => (el: HTMLElement | null) => {
    beatRefs.current[name] = el
  }

  const skip = () => {
    const stage = stageRef.current!
    window.scrollTo({ top: stage.offsetTop + stage.offsetHeight - window.innerHeight * 0.2, behavior: 'smooth' })
  }

  return (
    <div className="story">
      <section className="story-stage" ref={stageRef} aria-label="PEARL Robot Hub">
        <div className="story-sticky">
          <canvas ref={canvasRef} className="story-canvas" />
          <div className="story-vignette" />

          <div className="story-beat story-hero" ref={beat('hero')}>
            <p className="story-kicker">PEARL Lab · TU Darmstadt</p>
            <h1 className="story-title">
              {t('story.title1')}
              <br />
              <span className="grad-text">{t('story.title2')}</span>
            </h1>
          </div>

          {(['f1', 'f2', 'f3', 'f4'] as const).map((f, i) => (
            <div key={f} className={`story-beat story-feature ${i % 2 ? 'right' : 'left'}`} ref={beat(f)}>
              <span className="story-index">0{i + 1}</span>
              <h2>{t(`story.${f}.title`)}</h2>
              <p>{t(`story.${f}.text`)}</p>
            </div>
          ))}

          <div className="story-beat story-lockup" ref={beat('lockup')}>
            <LogoMark size={120} />
            <span className="story-word">PEARL</span>
            <span className="story-sub">Robot Hub · Franka · xArm · Tiago</span>
          </div>

          <div className="story-beat story-cta" ref={beat('cta')}>
            <h2>{t('story.cta')}</h2>
          </div>

          <button className="story-hint" ref={(el) => void (hintRef.current = el)} onClick={skip}>
            <span>{t('story.scroll')}</span>
            <i aria-hidden />
          </button>
          <button className="story-skip link" onClick={skip}>
            {t('story.skip')}
          </button>
        </div>
      </section>
      <div className="story-after">{children}</div>
    </div>
  )
}
