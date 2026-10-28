import { describe, expect, it } from 'vitest'
import { BEATS, beatOpacity, closeUpWeight, FADE, featureTime, fitLabel, progressAt, SCENE_KEYS, sceneTimeAt, SHOW, TIMELINE } from '../intro/timeline'

describe('scroll story timeline', () => {
  it('maps scroll progress to scene time through the keyframes', () => {
    for (const [p, t] of SCENE_KEYS) expect(sceneTimeAt(p)).toBeCloseTo(t)
    expect(sceneTimeAt(-1)).toBe(0)
    expect(sceneTimeAt(2)).toBe(SCENE_KEYS[SCENE_KEYS.length - 1][1])
  })

  it('never runs backwards while scrolling down', () => {
    let prev = -Infinity
    for (let p = 0; p <= 1; p += 0.001) {
      const t = sceneTimeAt(p)
      expect(t).toBeGreaterThanOrEqual(prev)
      prev = t
    }
  })

  it('lights the joints exactly when the logo beat starts', () => {
    // The logo lockup appears as the bloom flash peaks in the 3D scene.
    const flashAt = SCENE_KEYS.find(([, t]) => t >= TIMELINE.flash)![0]
    expect(BEATS.lockup[0]).toBeLessThanOrEqual(flashAt)
    expect(sceneTimeAt(BEATS.lockup[0] + FADE)).toBeGreaterThan(TIMELINE.ignite)
  })

  it('fades beats in and out at their edges', () => {
    const range = [0.3, 0.5] as const
    expect(beatOpacity(0.29, range)).toBe(0)
    expect(beatOpacity(0.3 + FADE / 2, range)).toBeCloseTo(0.5)
    expect(beatOpacity(0.4, range)).toBe(1)
    expect(beatOpacity(0.51, range)).toBe(0)
    // The first beat is fully visible at the very top, the last one stays at the very bottom.
    expect(beatOpacity(0, BEATS.hero)).toBe(1)
    expect(beatOpacity(1, BEATS.cta)).toBe(1)
  })

  it('shows the feature captions one at a time', () => {
    const features = [BEATS.f1, BEATS.f2, BEATS.f3, BEATS.f4]
    for (let p = 0; p <= 1; p += 0.005) {
      const visible = features.filter((r) => beatOpacity(p, r) > 0.5)
      expect(visible.length).toBeLessThanOrEqual(1)
    }
  })

  it('converts between scroll progress and scene time both ways', () => {
    for (let p = 0; p <= 1; p += 0.01) expect(progressAt(sceneTimeAt(p))).toBeCloseTo(p, 6)
  })

  it('shows each feature caption only after the arm has lifted its module, and while it shows it', () => {
    const captions = [BEATS.f1, BEATS.f2, BEATS.f3, BEATS.f4]
    captions.forEach((range, k) => {
      for (const phase of [SHOW.present + 0.03, SHOW.presentHold]) {
        expect(beatOpacity(progressAt(featureTime(k, phase)), range), `feature ${k + 1}`).toBe(1)
      }
      // ...and not before the arm has picked the module up and lifted it.
      expect(beatOpacity(progressAt(featureTime(k, SHOW.lift)), range)).toBe(0)
    })
  })

  it('moves the camera in on each module while it is presented, one at a time, and back out', () => {
    for (let k = 0; k < 4; k++) {
      expect(closeUpWeight(k, featureTime(k, SHOW.pick))).toBe(0)
      expect(closeUpWeight(k, featureTime(k, SHOW.present))).toBe(1)
      expect(closeUpWeight(k, featureTime(k, SHOW.presentHold))).toBe(1)
      expect(closeUpWeight(k, featureTime(k, SHOW.place))).toBe(0)
    }
    // Smooth: no jumps between neighbouring frames, and never two close-ups at once.
    let prev = 0
    for (let t = 0; t <= TIMELINE.end; t += 0.002) {
      const weights = [0, 1, 2, 3].map((k) => closeUpWeight(k, t))
      expect(weights.filter((w) => w > 0).length).toBeLessThanOrEqual(1)
      const w = Math.max(...weights)
      expect(Math.abs(w - prev)).toBeLessThan(0.05)
      prev = w
    }
    // The overview is back for the finale.
    expect(closeUpWeight(3, TIMELINE.ignite)).toBe(0)
  })
})

describe('module label fitting', () => {
  // Monospace stand-in for canvas measureText: each character is 0.6 em wide.
  const measure = (text: string, px: number) => text.length * px * 0.6

  it('keeps a short name on one line, as large as allowed', () => {
    const { lines, size } = fitLabel('Live', 448, 300, measure)
    expect(lines).toEqual(['Live'])
    expect(size).toBe(150)
  })

  it('breaks a long name over lines so it can be drawn larger, and it always fits', () => {
    for (const label of ['Inventory & status', 'Reservierungen mit Kalender', 'Wartung und Fehlermeldungen']) {
      const { lines, size } = fitLabel(label, 448, 300, measure)
      expect(lines.join(' ')).toBe(label)
      for (const line of lines) expect(measure(line, size)).toBeLessThanOrEqual(448)
      expect(lines.length * size * 1.05).toBeLessThanOrEqual(300)
      expect(lines.length).toBeGreaterThan(1)
      expect(size).toBeGreaterThan(fitLabel(label.replace(/ /g, '-'), 448, 300, measure).size)
    }
  })
})
