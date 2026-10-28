// Timeline of the welcome story, in "scene seconds". The 3D scene and the text overlay both read it,
// so captions land exactly on what the arm is doing.
//
// Story: the arm stands next to a conveyor belt. For each of the four features a module rides in on the
// belt; the arm picks it up, turns it towards the camera (the caption shows), and sets it on a display
// pedestal. When all four stand on display, the joints light up and the logo appears.

export const FEATURE_COUNT = 4

export const TIMELINE = {
  featuresStart: 1, // feature k runs from featuresStart + k to featuresStart + k + 1
  ignite: 5.2, // all joint rings light up
  flash: 5.5, // bloom peak: the logo lands
  end: 6.6, // camera push-in done
} as const

/** Phases inside one feature segment (0..1 of that segment). */
export const SHOW = {
  pick: 0.22, // arm is down at the belt, module has arrived at the stop
  grab: 0.27, // fingers closed, module travels with the hand from here
  lift: 0.38,
  present: 0.55, // module held up to the camera...
  presentHold: 0.7, // ...until here
  place: 0.85, // module above its pedestal
  release: 0.88, // fingers open, module stays on the pedestal
} as const

export const featureTime = (k: number, phase: number) => TIMELINE.featuresStart + k + phase

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}

/** How far the camera has moved in on module k at scene time t: 0 (overview) .. 1 (close-up while presented). */
export function closeUpWeight(k: number, t: number) {
  const s = t - featureTime(k, 0)
  if (s <= SHOW.grab || s >= SHOW.place) return 0
  if (s < SHOW.present) return smooth((s - SHOW.grab) / (SHOW.present - SHOW.grab))
  if (s <= SHOW.presentHold) return 1
  return 1 - smooth((s - SHOW.presentHold) / (SHOW.place - SHOW.presentHold))
}

/**
 * Break a label into one to three lines and pick the largest font size (px) at which every line is at most
 * `maxWidth` wide and the block at most `maxHeight` tall. `measure(text, px)` returns the drawn width.
 */
export function fitLabel(label: string, maxWidth: number, maxHeight: number, measure: (text: string, px: number) => number, maxSize = 150) {
  const words = label.trim().split(/\s+/)
  const probe = 100
  let best = { lines: [label.trim()], size: 0 }
  for (let n = 1; n <= Math.min(3, words.length); n++) {
    for (const lines of splits(words, n)) {
      const widest = Math.max(...lines.map((l) => measure(l, probe)))
      const size = Math.floor(Math.min(maxSize, (probe * maxWidth) / widest, maxHeight / (n * 1.05)))
      if (size > best.size) best = { lines, size }
    }
  }
  return best
}

/** Every way to split `words` into `n` non-empty consecutive lines. */
function splits(words: string[], n: number): string[][] {
  if (n === 1) return [[words.join(' ')]]
  const out: string[][] = []
  for (let i = 1; i <= words.length - n + 1; i++) {
    for (const rest of splits(words.slice(i), n - 1)) out.push([words.slice(0, i).join(' '), ...rest])
  }
  return out
}

// --- Scroll progress p (0..1 across the pinned section) -> scene time, and the text beats ---

// [progress, scene seconds] keyframes; linear in between. Most of the scroll belongs to the four features.
export const SCENE_KEYS: [number, number][] = [
  [0.0, 0],
  [0.06, 0.55], // short intro: belt starts, first module rides in
  [0.86, 5.0], // the four features, 0.2 of the scroll each
  [1.0, TIMELINE.end], // finale: lights, logo, camera push
]

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function sceneTimeAt(p: number) {
  for (let i = 1; i < SCENE_KEYS.length; i++) {
    const [p0, t0] = SCENE_KEYS[i - 1]
    const [p1, t1] = SCENE_KEYS[i]
    if (p <= p1) return t0 + (t1 - t0) * clamp01((p - p0) / (p1 - p0))
  }
  return SCENE_KEYS[SCENE_KEYS.length - 1][1]
}

/** Inverse of sceneTimeAt. */
export function progressAt(t: number) {
  for (let i = 1; i < SCENE_KEYS.length; i++) {
    const [p0, t0] = SCENE_KEYS[i - 1]
    const [p1, t1] = SCENE_KEYS[i]
    if (t <= t1) return p0 + (p1 - p0) * clamp01((t - t0) / (t1 - t0))
  }
  return 1
}

// Text beats: [from, to] in progress. Each fades in/out over FADE at its edges.
// A feature caption starts only after the arm has picked up and lifted its module (fully shown by the time the
// module faces the camera), and goes once the module stands on its pedestal.
export const FADE = 0.03
const caption = (k: number) =>
  [progressAt(featureTime(k, SHOW.lift + 0.03)), progressAt(featureTime(k, SHOW.release + 0.02))] as const

export const BEATS = {
  hero: [0, progressAt(0.8)],
  f1: caption(0),
  f2: caption(1),
  f3: caption(2),
  f4: caption(3),
  lockup: [progressAt(TIMELINE.ignite + 0.2), progressAt(6.25)],
  cta: [progressAt(6.25), 1.01],
} as const
export type Beat = keyof typeof BEATS

/** 0 outside the beat, 1 inside it, linear ramps of width FADE at both ends. */
export function beatOpacity(p: number, [from, to]: readonly [number, number]) {
  const fadeIn = from <= 0 ? 1 : clamp01((p - from) / FADE)
  const fadeOut = to >= 1 ? 1 : clamp01((to - p) / FADE)
  return Math.min(fadeIn, fadeOut)
}
