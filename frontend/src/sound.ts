/**
 * Sound for the site, synthesized with the Web Audio API: no audio files to load or license.
 *
 * Browsers only allow sound after a click or key press, so nothing plays until `unlock()` ran inside such a
 * gesture (App wires it to the first pointer or key event). The setting is the "Sound" switch in the appearance
 * panel and on the intro.
 *
 * Built like a small foley studio rather than beeps: struck glass and metal are modal synthesis (a few inharmonic
 * partials, each decaying at its own rate, plus a noise transient for the contact), and everything shares a
 * synthetic hall reverb, the dark lab the site is set in. Quiet and short, so it accompanies rather than announces.
 *
 * - UI: `tick` (button), `success` (signed in), `error` (an error message appears)
 * - Intro: `logo`, once, as the PEARL logo appears (the assembly itself plays in silence)
 */

class SoundEngine {
  private ctx: AudioContext | null = null
  private dry: GainNode | null = null
  private wet: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private enabled = true

  setEnabled(on: boolean) {
    this.enabled = on
  }

  isEnabled() {
    return this.enabled
  }

  /** Call from a user gesture: creates or resumes the audio context. */
  unlock() {
    if (!this.enabled) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    if (!this.ctx) {
      const ctx = new Ctor()
      this.ctx = ctx
      // Master: a gentle compressor keeps impacts from clipping and layers from piling up.
      const master = ctx.createGain()
      master.gain.value = 0.55
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -18
      comp.ratio.value = 4
      comp.attack.value = 0.004
      comp.release.value = 0.2
      master.connect(comp).connect(ctx.destination)
      this.dry = ctx.createGain()
      this.dry.connect(master)
      // Hall reverb from a generated impulse response: decaying stereo noise, darker as it fades.
      const reverb = ctx.createConvolver()
      reverb.buffer = this.impulse(ctx, 2.4)
      this.wet = ctx.createGain()
      this.wet.gain.value = 0.32
      this.wet.connect(reverb).connect(master)
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = noise
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private impulse(ctx: AudioContext, seconds: number) {
    const length = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      let low = 0
      for (let i = 0; i < length; i++) {
        const t = i / length
        // Early reflections in the first 60 ms, then a smooth tail; a one-pole lowpass that closes over time.
        const white = Math.random() * 2 - 1
        const k = 0.15 + 0.8 * t
        low += (white - low) * (1 - k)
        const early = i < ctx.sampleRate * 0.06 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.8 : 0
        data[i] = (low * 0.9 + early) * Math.pow(1 - t, 3.2)
      }
    }
    return buffer
  }

  /** The context when sound may play now, else null (off, not unlocked yet, or no Web Audio). */
  private live(): AudioContext | null {
    return this.enabled && this.ctx?.state === 'running' ? this.ctx : null
  }

  /** Routes a source to the dry bus and, `send` of it, to the hall. */
  private out(node: AudioNode, send = 0.25) {
    node.connect(this.dry!)
    if (send > 0) {
      const s = this.ctx!.createGain()
      s.gain.value = send
      node.connect(s).connect(this.wet!)
    }
  }

  /**
   * A struck object: partials [frequency, decay seconds, relative level], plus a short noise transient for the
   * contact itself. `detune` spreads repeated hits so they never sound identical.
   */
  private strike(
    partials: [number, number, number][],
    { at = 0, level = 0.2, send = 0.25, contact = 0.5, contactFreq = 3000, detune = 0.02 } = {},
  ) {
    const ctx = this.live()
    if (!ctx) return
    const t = ctx.currentTime + at
    const bus = ctx.createGain()
    bus.gain.value = level
    this.out(bus, send)
    const spread = 1 + (Math.random() * 2 - 1) * detune
    for (const [f, decay, g] of partials) {
      const osc = ctx.createOscillator()
      osc.frequency.value = f * spread
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(g, t + 0.002)
      env.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      osc.connect(env).connect(bus)
      osc.start(t)
      osc.stop(t + decay + 0.05)
    }
    if (contact > 0) this.burst({ at, dur: 0.012, level: level * contact, type: 'bandpass', freq: contactFreq, q: 0.8, send })
  }

  /** A shaped noise burst. */
  private burst({ at = 0, dur = 0.05, level = 0.1, type = 'bandpass' as BiquadFilterType, freq = 2000, q = 1, send = 0.2, decay = 3 } = {}) {
    const ctx = this.live()
    if (!ctx || !this.noiseBuffer) return
    const t = ctx.currentTime + at
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const env = ctx.createGain()
    env.gain.setValueAtTime(level, t)
    env.gain.setTargetAtTime(0.0001, t + dur * 0.2, dur / decay)
    src.connect(f).connect(env)
    this.out(env, send)
    src.start(t, Math.random() * 1.5)
    src.stop(t + dur * 3 + 0.05)
  }

  /** A held tone with attack and release (pads, hums, sweeps). */
  private tone({
    at = 0,
    freq = 440,
    to = 0,
    dur = 1,
    level = 0.05,
    type = 'sine' as OscillatorType,
    attack = 0.01,
    release = 0.3,
    filter = 0,
    filterTo = 0,
    send = 0.3,
    detune = 0,
  } = {}) {
    const ctx = this.live()
    if (!ctx) return
    const t = ctx.currentTime + at
    const osc = ctx.createOscillator()
    osc.type = type
    osc.detune.value = detune
    osc.frequency.setValueAtTime(freq, t)
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(level, t + attack)
    env.gain.setValueAtTime(level, t + dur)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + release)
    let node: AudioNode = osc
    if (filter) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(filter, t)
      if (filterTo) f.frequency.exponentialRampToValueAtTime(filterTo, t + dur)
      f.Q.value = 0.7
      node = node.connect(f)
    }
    node.connect(env)
    this.out(env, send)
    osc.start(t)
    osc.stop(t + dur + release + 0.05)
  }

  // --- Interface: quiet, glassy, a little reverb, like touching a dark glass panel ---

  tick() {
    this.strike(
      [
        [2350, 0.07, 1],
        [3960, 0.045, 0.45],
        [6100, 0.03, 0.2],
      ],
      { level: 0.035, send: 0.18, contact: 0.6, contactFreq: 5200, detune: 0.03 },
    )
  }

  success() {
    // Two soft bell tones (bell partials) over a short airy swell.
    const bell = (f: number, at: number, level: number) =>
      this.strike(
        [
          [f, 1.4, 1],
          [f * 2.01, 0.9, 0.35],
          [f * 2.76, 0.6, 0.22],
          [f * 5.4, 0.25, 0.08],
        ],
        { at, level, send: 0.45, contact: 0.1, contactFreq: 6000, detune: 0 },
      )
    bell(659.25, 0, 0.07)
    bell(987.77, 0.11, 0.06)
    this.tone({ freq: 329.63, dur: 0.25, level: 0.018, type: 'triangle', attack: 0.12, release: 0.9, filter: 1200, send: 0.6 })
  }

  error() {
    // A muted double knock, low and short: noticeable without alarm.
    for (const at of [0, 0.13]) {
      this.strike(
        [
          [196, 0.22, 1],
          [311, 0.14, 0.4],
          [523, 0.08, 0.15],
        ],
        { at, level: 0.075, send: 0.2, contact: 0.3, contactFreq: 900, detune: 0.01 },
      )
    }
  }

  // --- Intro ---

  /**
   * The PEARL logo appears: a soft rising breath of air, then a clear struck chime over a warm, wide chord that
   * blooms and fades in the hall. About three seconds, nothing harsh.
   */
  logo() {
    const ctx = this.live()
    if (!ctx || !this.noiseBuffer) return
    // The swell: band-passed noise sweeping up, fading in, cut as the logo lands.
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const sweep = ctx.createBiquadFilter()
    sweep.type = 'bandpass'
    sweep.Q.value = 1.4
    sweep.frequency.setValueAtTime(300, t)
    sweep.frequency.exponentialRampToValueAtTime(5200, t + 0.45)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(0.05, t + 0.42)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.62)
    src.connect(sweep).connect(env)
    this.out(env, 0.5)
    src.start(t, Math.random())
    src.stop(t + 0.7)
    // A low pulse under the landing.
    this.tone({ at: 0.42, freq: 110, to: 55, dur: 0.18, level: 0.09, type: 'sine', attack: 0.004, release: 0.6, send: 0.3 })
    // The chime: bell partials on A5 and E6.
    const bell = (f: number, at: number, level: number) =>
      this.strike(
        [
          [f, 2.6, 1],
          [f * 2.0, 1.6, 0.3],
          [f * 2.76, 1.0, 0.18],
          [f * 5.4, 0.4, 0.06],
        ],
        { at, level, send: 0.7, contact: 0.15, contactFreq: 7000, detune: 0 },
      )
    bell(880, 0.44, 0.06)
    bell(1318.5, 0.52, 0.04)
    // The chord in A major, detuned pairs for width, blooming slowly.
    for (const [f, d] of [
      [110, -5],
      [220, 4],
      [277.18, -6],
      [329.63, 5],
      [440, -3],
      [554.37, 6],
    ]) {
      this.tone({ at: 0.42, freq: f, dur: 1.1, level: 0.014, type: 'sawtooth', attack: 0.35, release: 2.2, filter: 900, filterTo: 2600, send: 0.7, detune: d })
    }
    // A last high shimmer.
    this.strike([[3520, 1.8, 1], [5274, 1.1, 0.4]], { at: 0.9, level: 0.012, send: 0.8, contact: 0, detune: 0 })
  }
}

export const sound = new SoundEngine()
