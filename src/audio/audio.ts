// Audio bus (T16). Web Audio, synthesized placeholder SFX (no assets yet).
// Hard voice cap (§15 "cap simultaneous audio voices"): extra triggers drop.
// AudioContext starts suspended until a user gesture (browser autoplay policy).

import type { FxKind } from '../sim/fx';

const MAX_VOICES = 16;

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private lastAt: Partial<Record<FxKind, number>> = {};
  masterVolume = 0.5;

  /** Lazily create the context; call from a user-gesture handler. */
  resume(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.master) this.master.gain.value = this.masterVolume;
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 0.3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Deterministic-ish noise (no Math.random dependency for reproducibility).
    let s = 1;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s / 0x40000000 - 1) * 0.6;
    }
    return buf;
  }

  private claim(): boolean {
    if (!this.ctx || !this.master || this.voices >= MAX_VOICES) return false;
    this.voices++;
    return true;
  }

  private release(node: AudioScheduledSourceNode, at: number, dur: number): void {
    node.stop(at + dur);
    node.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
    };
  }

  /** Play a cue for an FX kind. Rate-limited per kind to avoid machine-gun stacking. */
  play(kind: FxKind): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const minGap = kind === 'muzzle' ? 0.04 : 0.02;
    if (now - (this.lastAt[kind] ?? -1) < minGap) return;

    if (kind === 'muzzle') this.muzzleSfx(now);
    else if (kind === 'impact') this.impactSfx(now);
    else this.deathSfx(now);
    this.lastAt[kind] = now;
  }

  private muzzleSfx(now: number): void {
    if (!this.claim()) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g).connect(this.master!);
    osc.start(now);
    this.release(osc, now, 0.1);
  }

  private impactSfx(now: number): void {
    if (!this.claim()) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(now);
    this.release(src, now, 0.07);
  }

  private deathSfx(now: number): void {
    if (!this.claim()) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(180, now + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    src.connect(lp).connect(g).connect(this.master!);
    src.start(now);
    this.release(src, now, 0.2);
  }
}
