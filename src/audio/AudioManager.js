/**
 * AudioManager - all sound for the game (Phase 11).
 *
 * Every sound is SYNTHESISED with the Web Audio API rather than loaded from a
 * file. That keeps the project asset-free (nothing to 404, nothing to license,
 * instant load) and, for a viva, it is far easier to point at: each effect is a
 * visible oscillator/envelope you can talk through.
 *
 * Browser autoplay policy: an AudioContext created before the user's first
 * gesture starts 'suspended' and silently drops every sound. So the context is
 * created lazily on the first real interaction, and `unlock()` is also called
 * defensively from the pointer-lock handler.
 *
 * Layout:
 *   master gain -> [sfx bus] [ambience bus]
 * so ambience can be ducked independently of the sound effects.
 */
export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} created on first gesture */
    this.ctx = null;

    this.master = null;
    this.sfxBus = null;
    this.ambienceBus = null;

    this.enabled = true;
    this.volume = 0.7;

    // Ambience handle, kept so it can be stopped on demand.
    this._ambience = null;
    this._noiseBuffer = null;
    this._stepFlip = false;

    // Rate limiting. Footsteps in particular fire from movement distance, and
    // a player jogging on a low frame rate can retrigger several in one frame.
    this._lastPlayed = new Map();
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /**
   * Create (or resume) the AudioContext. MUST be called from inside a user
   * gesture handler - a click, a keypress, or pointer lock.
   * @returns {boolean} true if the context is running
   */
  unlock() {
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      // No Web Audio support: stay silent rather than throwing and breaking the
      // whole game over a missing audio feature.
      if (!Ctor) return false;

      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 1;
      this.sfxBus.connect(this.master);

      this.ambienceBus = this.ctx.createGain();
      this.ambienceBus.gain.value = 0;
      this.ambienceBus.connect(this.master);
    }

    if (this.ctx.state === 'suspended') {
      // Fire and forget - some browsers return a promise that rejects if the
      // gesture has already ended, which must not break the caller.
      this.ctx.resume().catch(() => {});
    }
    return this.ctx.state === 'running';
  }

  /** Master mute. Ambience fades too, so silence really is silence. */
  setEnabled(on) {
    this.enabled = !!on;
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, t, 0.05);
  }

  /** Linear master volume, 0..1. */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.enabled) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  get isReady() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ------------------------------------------------------------------
  // Synthesis primitives
  // ------------------------------------------------------------------

  /**
   * A tone with an exponential decay.
   * @param {{freq: number, type?: string, dur?: number, gain?: number,
   *          slideTo?: number|null, delay?: number, dest?: AudioNode|null}} o
   */
  _tone({ freq, type = 'sine', dur = 0.2, gain = 0.3, slideTo = null, delay = 0, dest = null }) {
    if (!this.isReady) return;
    const t0 = this.ctx.currentTime + delay;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    // A pitch glide turns a static beep into a recognisable "clunk" or "chime".
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);   // fast attack
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);   // smooth decay

    osc.connect(env);
    env.connect(dest || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** White-noise buffer, built once and reused by every noise-based effect. */
  _noise() {
    if (this._noiseBuffer) return this._noiseBuffer;
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    return buf;
  }

  /**
   * Rate limiter so a per-frame or per-keystroke caller cannot machine-gun a
   * sound. Returns false if this sound fired too recently.
   */
  _allow(key, minGapSec) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    const last = this._lastPlayed.get(key);
    if (last !== undefined && now - last < minGapSec) return false;
    this._lastPlayed.set(key, now);
    return true;
  }

  /**
   * Filtered noise burst - the basis for clicks, scrapes and thuds.
   * @param {{dur?: number, gain?: number, freq?: number, q?: number,
   *          type?: string, sweepTo?: number|null, delay?: number}} o
   */
  _noiseBurst({ dur = 0.15, gain = 0.3, freq = 1200, q = 1, type = 'bandpass', sweepTo = null, delay = 0 }) {
    if (!this.isReady) return;
    const t0 = this.ctx.currentTime + delay;

    const src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = q;
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /**
   * Rate limiter so a per-frame or per-keystroke caller cannot machine-gun a
   * sound. Returns false if this sound fired too recently.
   */
  _allow(key, minGapSec) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    const last = this._lastPlayed.get(key);
    if (last !== undefined && now - last < minGapSec) return false;
    this._lastPlayed.set(key, now);
    return true;
  }

  // ------------------------------------------------------------------
  // Game sounds
  // ------------------------------------------------------------------

  /** Keypad digit / confirm / clear blip. */
  keypadPress(kind = 'digit') {
    if (!this.isReady) return;
    if (kind === 'ok') {
      this._tone({ freq: 660, type: 'square', dur: 0.1, gain: 0.16 });
      this._tone({ freq: 990, type: 'square', dur: 0.16, gain: 0.16, delay: 0.09 });
    } else if (kind === 'clear') {
      this._tone({ freq: 300, type: 'square', dur: 0.1, gain: 0.14, slideTo: 170 });
    } else {
      this._tone({ freq: 880, type: 'square', dur: 0.06, gain: 0.12 });
    }
  }

  /** Code rejected: a low, deliberately unpleasant buzz. */
  keypadReject() {
    this._tone({ freq: 150, type: 'sawtooth', dur: 0.35, gain: 0.22, slideTo: 90 });
    this._noiseBurst({ dur: 0.2, gain: 0.1, freq: 400, q: 2 });
  }

  /** Code accepted: a short rising two-note confirmation. */
  keypadAccept() {
    this._tone({ freq: 523, type: 'sine', dur: 0.14, gain: 0.2 });
    this._tone({ freq: 784, type: 'sine', dur: 0.26, gain: 0.2, delay: 0.11 });
  }

  /** Drawer sliding open: filtered noise sweeping up, plus a wooden stop. */
  drawerOpen() {
    this._noiseBurst({ dur: 0.55, gain: 0.2, freq: 260, q: 0.8, sweepTo: 900 });
    this._tone({ freq: 120, type: 'triangle', dur: 0.18, gain: 0.18, delay: 0.5 });
  }

  /** Pickup: a bright metallic ping, two partials for a bell-like timbre. */
  pickup() {
    this._tone({ freq: 1180, type: 'sine', dur: 0.22, gain: 0.16 });
    this._tone({ freq: 1770, type: 'sine', dur: 0.3, gain: 0.09, delay: 0.03 });
  }

  /** One gear tooth engaging: a short mechanical click with a pitch drop. */
  gearTurn() {
    this._noiseBurst({ dur: 0.09, gain: 0.22, freq: 2200, q: 3 });
    this._tone({ freq: 420, type: 'square', dur: 0.08, gain: 0.1, slideTo: 220 });
  }

  /** Power restored: a deep thump, a rising sweep, then the room comes alive. */
  powerOn() {
    this._tone({ freq: 60, type: 'sine', dur: 1.2, gain: 0.3 });
    this._noiseBurst({ dur: 0.9, gain: 0.14, freq: 200, q: 0.7, sweepTo: 3000 });
    this._tone({ freq: 220, type: 'sawtooth', dur: 1.4, gain: 0.08, slideTo: 660, delay: 0.35 });
    this.startAmbience(0.5);
  }

  /**
   * Exit door swinging open: a long creaking hinge.
   *
   * Built in three layers because a single element cannot read as "heavy metal
   * door": a detuned pair of low oscillators for the mass of the leaf, a swept
   * noise band for the hinge rubbing, and a short scrape that peaks mid-swing
   * as the door reaches its widest.
   */
  doorOpen() {
    // Hinge: noise rising then falling as the door accelerates and settles.
    this._noiseBurst({ dur: 1.1, gain: 0.2, freq: 220, q: 1.6, sweepTo: 700 });
    this._noiseBurst({ dur: 0.5, gain: 0.14, freq: 900, q: 2.2, sweepTo: 400, delay: 0.35 });
    // Mass of the leaf swinging.
    this._tone({ freq: 96, type: 'sawtooth', dur: 0.8, gain: 0.1, slideTo: 150 });
    this._tone({ freq: 143, type: 'sine', dur: 0.7, gain: 0.07, slideTo: 210, delay: 0.05 });
  }

  /**
   * Exit door swinging shut. Mirrors doorOpen but ends on a solid latch click,
   * which is the part the player actually hears as "that closed".
   */
  doorClose() {
    this._noiseBurst({ dur: 0.8, gain: 0.17, freq: 640, q: 1.6, sweepTo: 180 });
    this._tone({ freq: 140, type: 'sawtooth', dur: 0.6, gain: 0.09, slideTo: 80 });
    // Latch snapping home at the end of the swing.
    this._noiseBurst({ dur: 0.07, gain: 0.3, freq: 2600, q: 4, delay: 0.62 });
    this._tone({ freq: 260, type: 'square', dur: 0.09, gain: 0.14, delay: 0.62 });
  }

  /** Deadbolt releasing after the machine powers up. */
  doorUnlock() {
    this._noiseBurst({ dur: 0.12, gain: 0.28, freq: 3000, q: 4 });
    this._tone({ freq: 200, type: 'square', dur: 0.09, gain: 0.12, delay: 0.08 });
  }

  /** Knife-switch throw: a hard metallic clack. */
  switchToggle() {
    this._noiseBurst({ dur: 0.05, gain: 0.22, freq: 3400, q: 3 });
    this._tone({ freq: 340, type: 'square', dur: 0.05, gain: 0.1 });
  }

  /** Wrong combination: a low mains buzz that says "fault", not silence. */
  circuitBuzz() {
    if (!this.isReady || !this._allow('buzz', 0.8)) return;
    this._tone({ freq: 110, type: 'sawtooth', dur: 0.35, gain: 0.12 });
    this._tone({ freq: 116, type: 'sawtooth', dur: 0.35, gain: 0.1 });
  }

  /** Circuit complete: relays engage, then a rising swell as power latches. */
  circuitActivate() {
    this._noiseBurst({ dur: 0.06, gain: 0.2, freq: 3000, q: 3 });
    this._tone({ freq: 220, type: 'square', dur: 0.08, gain: 0.12, delay: 0.1 });
    this._tone({ freq: 440, type: 'sawtooth', dur: 0.6, gain: 0.1, slideTo: 880, delay: 0.2 });
  }

  /** Footstep. Rate limited so a fast walk cannot stack them into a buzz. */
  footstep() {
    if (!this.isReady || !this._allow('step', 0.22)) return;
    // Alternating filter keeps successive steps from sounding identical.
    this._stepFlip = !this._stepFlip;
    this._noiseBurst({
      dur: 0.1,
      gain: 0.09,
      freq: this._stepFlip ? 900 : 1250,
      q: 1.1,
      type: 'lowpass',
    });
  }

  /** Escape sting: a slow major chord. */
  escape() {
    [261.6, 329.6, 392.0, 523.3].forEach((f, i) => {
      this._tone({ freq: f, type: 'sine', dur: 1.8 - i * 0.15, gain: 0.13, delay: i * 0.12 });
    });
  }

  /** Generic UI click for the interaction prompt / panels. */
  uiClick() {
    this._tone({ freq: 1200, type: 'sine', dur: 0.05, gain: 0.08 });
  }

  // ------------------------------------------------------------------
  // Ambience
  // ------------------------------------------------------------------

  /**
   * Start the low room drone (air handling / the machine idling).
   * @param {number} level 0..1 how loud
   */
  startAmbience(level = 0.35) {
    if (!this.isReady || this._ambience) return;

    // Two detuned low oscillators plus a filtered noise bed read as "big empty
    // room" far better than a single sine.
    const t0 = this.ctx.currentTime;

    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t0);
    bus.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), t0 + 2.0);
    bus.connect(this.ambienceBus);

    const oscs = [55, 82.5, 110].map((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f + (i - 1) * 0.4;   // slight detune avoids a sterile tone
      const g = this.ctx.createGain();
      g.gain.value = 0.5 / (i + 1);
      o.connect(g);
      g.connect(bus);
      o.start(t0);
      return o;
    });

    const air = this.ctx.createBufferSource();
    air.buffer = this._noise();
    air.loop = true;
    const airFilter = this.ctx.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 320;
    const airGain = this.ctx.createGain();
    airGain.gain.value = 0.16;
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(bus);
    air.start(t0);

    this._ambience = { bus, oscs, air };
  }

  stopAmbience() {
    if (!this._ambience || !this.ctx) return;
    const { bus, oscs, air } = this._ambience;
    const t0 = this.ctx.currentTime;
    // Fade rather than cut, otherwise stopping it clicks.
    bus.gain.cancelScheduledValues(t0);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t0);
    bus.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
    for (const o of oscs) o.stop(t0 + 0.9);
    air.stop(t0 + 0.9);
    this._ambience = null;
  }

  get ambiencePlaying() {
    return !!this._ambience;
  }
}
