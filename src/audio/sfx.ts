// Tiny synthesised sounds (WebAudio). Off by default; nothing is downloaded.
// Also a soft generative soundtrack (slow chords on a pentatonic scale, a little echo) whose mood follows the game.
type Kind = 'click' | 'place' | 'success' | 'fail' | 'full' | 'star' | 'drip' | 'thunder';
export type Mood = 'off' | 'calm' | 'play' | 'storm' | 'end';
const SCALES: Record<Exclude<Mood, 'off'>, { chords: number[][]; every: number; gain: number; wave: OscillatorType }> = {
  // MIDI notes; each chord is held a few seconds with a slow swell
  calm: { chords: [[60, 64, 67, 74], [57, 64, 69, 72], [53, 60, 65, 69], [55, 62, 67, 71]], every: 5.2, gain: 0.03, wave: 'sine' },
  play: { chords: [[62, 66, 69, 76], [59, 66, 71, 74], [57, 64, 69, 73], [55, 62, 67, 71]], every: 3.6, gain: 0.028, wave: 'triangle' },
  storm: { chords: [[45, 52, 57, 60], [43, 50, 55, 58], [41, 48, 53, 57], [43, 50, 55, 59]], every: 4.4, gain: 0.034, wave: 'sine' },
  end: { chords: [[53, 60, 65, 69, 74], [50, 57, 62, 65, 72], [55, 62, 67, 71, 74], [48, 55, 60, 64, 67]], every: 4.8, gain: 0.03, wave: 'sine' },
};
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Sfx {
  enabled = false;
  private ctx: AudioContext | null = null;
  private rainNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private mood: Mood = 'off';
  /** set by the first tap or key on the page (browsers allow sound only after one) */
  unlocked = false;
  private musicTimer: number | null = null;
  private bus: GainNode | null = null;
  private step = 0;
  /** The soundtrack's mood ('off' stops it). Plays only while sound is on. */
  music(m: Mood) {
    if (m === this.mood) return;
    this.mood = m;
    if (this.musicTimer != null) { window.clearTimeout(this.musicTimer); this.musicTimer = null; }
    if (m === 'off' || !this.enabled) return;
    this.step = 0;
    this.tick();
  }
  /** Sound switched on or off: start or stop the soundtrack in the current mood. */
  soundChanged() {
    if (this.musicTimer != null) { window.clearTimeout(this.musicTimer); this.musicTimer = null; }
    if (this.enabled && this.mood !== 'off') this.tick();
  }
  private musicBus() {
    const ac = this.ac(); if (!ac) return null;
    if (!this.bus) {
      // dry + a soft feedback echo, so the chords hang in the air
      const bus = ac.createGain(); bus.gain.value = 0.8;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      const delay = ac.createDelay(2); delay.delayTime.value = 0.42;
      const fb = ac.createGain(); fb.gain.value = 0.38;
      const wet = ac.createGain(); wet.gain.value = 0.5;
      bus.connect(lp); lp.connect(ac.destination); lp.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(ac.destination);
      this.bus = bus;
    }
    return this.bus;
  }
  private tick() {
    if (this.mood === 'off' || !this.enabled) { this.musicTimer = null; return; }
    // before the first tap the browser keeps audio blocked: touch nothing (no audio context, no queued chords that
    // would all sound at once later), just look again shortly
    if (!this.unlocked) { this.musicTimer = window.setTimeout(() => this.tick(), 800); return; }
    const ac = this.ac(); const bus = this.musicBus(); if (!ac || !bus) return;
    if (ac.state !== 'running') { ac.resume().catch(() => {}); this.musicTimer = window.setTimeout(() => this.tick(), 800); return; }
    const sc = SCALES[this.mood];
    const chord = sc.chords[this.step % sc.chords.length]; this.step++;
    const t0 = ac.currentTime + 0.05, hold = sc.every * 1.25;
    chord.forEach((n, k) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = sc.wave; o.frequency.setValueAtTime(hz(n), t0); o.detune.setValueAtTime((k % 2 ? 4 : -4), t0);
      const peak = sc.gain * (k === 0 ? 1.1 : 0.8);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + 1.4 + k * 0.12); g.gain.linearRampToValueAtTime(peak * 0.6, t0 + hold * 0.6); g.gain.linearRampToValueAtTime(0.0001, t0 + hold);
      o.connect(g).connect(bus); o.start(t0 + k * 0.12); o.stop(t0 + hold + 0.1);
    });
    // a soft high note now and then (a little melody over the chords)
    if (this.mood !== 'storm' && this.step % 2 === 0) {
      const n = chord[chord.length - 1] + 12 + [0, 2, -3, 5][this.step % 4];
      this.tone(hz(n), 1.6, 'sine', sc.gain * 0.5, sc.every * 0.45);
    }
    this.musicTimer = window.setTimeout(() => this.tick(), sc.every * 1000);
  }
  private ac() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { this.ctx = null; }
    }
    return this.ctx;
  }
  tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, when = 0) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  play(kind: Kind) {
    if (!this.enabled) return;
    switch (kind) {
      case 'click': this.tone(660, 0.06, 'triangle', 0.06); break;
      case 'place': this.tone(392, 0.12, 'sine', 0.1); this.tone(587, 0.12, 'sine', 0.08, 0.06); break;
      case 'full': this.tone(220, 0.25, 'square', 0.05); break;
      case 'drip': this.tone(900 + Math.random() * 300, 0.05, 'sine', 0.03); break;
      case 'star': this.tone(880, 0.15, 'triangle', 0.08); break;
      case 'success': [523, 659, 784, 1046].forEach((f, k) => this.tone(f, 0.25, 'triangle', 0.09, k * 0.09)); break;
      case 'fail': [392, 330, 262].forEach((f, k) => this.tone(f, 0.25, 'sine', 0.08, k * 0.12)); break;
      case 'thunder': this.thunder(); break;
    }
  }
  /** a low rumble (filtered noise), for a storm day */
  private thunder() {
    const ac = this.ac(); if (!ac) return;
    const len = Math.floor(ac.sampleRate * 2.6), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = 0.985 * last + 0.015 * (Math.random() * 2 - 1); ch[i] = last * 9; }
    const src = ac.createBufferSource(); src.buffer = buf;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ac.createGain(); const t = ac.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.08); g.gain.linearRampToValueAtTime(0.32, t + 0.5); g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    src.connect(lp).connect(g).connect(ac.destination); src.start(t); src.stop(t + 2.6);
  }
  rain(level: number) {
    if (!this.enabled) { this.stopRain(); return; }
    const ac = this.ac(); if (!ac) return;
    if (!this.rainNode) {
      const len = ac.sampleRate * 2;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const ch = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = 0.97 * last + 0.03 * w; ch[i] = last * 6; }
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const gain = ac.createGain(); gain.gain.value = 0;
      src.connect(gain).connect(ac.destination); src.start();
      this.rainNode = { src, gain };
    }
    this.rainNode.gain.gain.linearRampToValueAtTime(Math.min(0.25, level * 0.25), ac.currentTime + 0.3);
  }
  stopRain() {
    if (this.rainNode && this.ctx) { this.rainNode.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3); }
  }
}
export const sfx = new Sfx();
// the first tap or key anywhere lets audio start (browsers block sound until then)
if (typeof window !== 'undefined') {
  const wake = () => { sfx.unlocked = true; if (!sfx.enabled) return; try { (sfx as any).ac()?.resume?.(); } catch { /* no audio */ } };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
}
