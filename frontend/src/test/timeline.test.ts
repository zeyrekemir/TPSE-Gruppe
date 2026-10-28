import { describe, expect, it } from 'vitest'
import { BEATS, beatOpacity, driveWindow, FADE, featureTime, LOGO_AT, logoReached, PARTS, partWindow, progressAt, SCENE_KEYS, sceneTimeAt, STAGES, TIMELINE } from '../intro/timeline'

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

  it('shows each feature caption while its assembly stage puts its parts on', () => {
    const captions = [BEATS.f1, BEATS.f2, BEATS.f3, BEATS.f4]
    captions.forEach((range, k) => {
      for (const p of STAGES[k]) {
        const [, seated] = partWindow(p)
        expect(beatOpacity(progressAt(seated), range), `part ${PARTS[p]}`).toBe(1)
      }
      // ...and not before the stage has begun.
      expect(beatOpacity(progressAt(featureTime(k, 0)), range)).toBe(0)
    })
  })
})

describe('assembly order', () => {
  it('puts every part on exactly once, one after the other, before the robot is complete', () => {
    expect(STAGES.flat().sort((a, b) => a - b)).toEqual(PARTS.map((_, p) => p))
    let prevSeated: number = TIMELINE.featuresStart
    PARTS.forEach((_, p) => {
      const [hooked, seated] = partWindow(p)
      expect(hooked).toBeGreaterThanOrEqual(prevSeated)
      expect(seated).toBeGreaterThan(hooked)
      prevSeated = seated
    })
    expect(prevSeated).toBeLessThanOrEqual(TIMELINE.assembled)
  })

  it('builds the drive of each joint before the crane brings the housing over it', () => {
    PARTS.forEach((_, p) => {
      const [built, done] = driveWindow(p)
      const [hooked] = partWindow(p)
      expect(done).toBeGreaterThan(built)
      expect(done).toBeLessThan(hooked)
    })
  })
})

describe('intro sound', () => {
  it('plays once, exactly when the PEARL logo appears, and only going forward', () => {
    let count = 0
    let at = -1
    for (let t = 0; t < TIMELINE.end; t += 0.01) {
      if (logoReached(t, t + 0.01)) {
        count++
        at = t + 0.01
      }
    }
    expect(count).toBe(1)
    expect(progressAt(at)).toBeCloseTo(BEATS.lockup[0], 2)
    expect(logoReached(LOGO_AT + 1, LOGO_AT - 1)).toBe(false)
    expect(logoReached(LOGO_AT, LOGO_AT)).toBe(false)
  })
})
