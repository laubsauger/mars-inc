// Audio bus (T16). Web Audio, synthesized placeholder SFX (no assets yet).
// Hard voice cap (§15 "cap simultaneous audio voices"): extra triggers drop.
// AudioContext starts suspended until a user gesture (browser autoplay policy).

import type { FxKind } from '../sim/fx';

const MAX_VOICES = 16;

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private lastAt: Partial<Record<FxKind, number>> = {};
  masterVolume = 0.5;
  sfxVolume = 1;

  /** Lazily create the context; call from a user-gesture handler. */
  resume(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); // SFX bus → master (separate volume, T36)
      this.sfx.connect(this.master);
      this.noise = this.makeNoise(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.applyVolumes();
  }

  /** Apply master + per-bus volumes (T36 accessibility). */
  applyVolumes(): void {
    if (this.master) this.master.gain.value = this.masterVolume;
    if (this.sfx) this.sfx.gain.value = this.sfxVolume;
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
    if (kind === 'ember') return; // visual-only flecks (burn ticks) — silent by design
    const now = this.ctx.currentTime;
    const minGap = kind === 'muzzle' ? 0.04 : 0.02;
    if (now - (this.lastAt[kind] ?? -1) < minGap) return;

    if (kind === 'muzzle') this.muzzleSfx(now);
    else if (kind === 'impact' || kind === 'teleport' || kind === 'corpseblast')
      this.impactSfx(now);
    else if (kind === 'levelup' || kind === 'bounty') this.levelUpSfx(now);
    else this.deathSfx(now);
    this.lastAt[kind] = now;
  }

  private muzzleSfx(now: number): void {
    if (!this.claim()) return;
    const ctx = this.ctx!;
    // Dull, suppressed "thwip" — a low-passed noise burst + a soft low thump.
    // Deliberately NOT a pitched square wave (no space-blaster pew).
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, now);
    lp.frequency.exponentialRampToValueAtTime(500, now + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    src.connect(lp).connect(g).connect(this.sfx!);

    const thump = ctx.createOscillator();
    const tg = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(150, now);
    thump.frequency.exponentialRampToValueAtTime(70, now + 0.05);
    tg.gain.setValueAtTime(0.06, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    thump.connect(tg).connect(this.sfx!);

    src.start(now);
    thump.start(now);
    thump.stop(now + 0.08); // not voice-counted; src.release tracks the voice
    this.release(src, now, 0.07);
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
    src.connect(bp).connect(g).connect(this.sfx!);
    src.start(now);
    this.release(src, now, 0.07);
  }

  private levelUpSfx(now: number): void {
    if (!this.claim()) return;
    const ctx = this.ctx!;
    // Warm rising two-tone swell — a power-up beat, not the dull death thud. Two
    // triangle voices a fifth apart, each gliding up, soft attack + slow release.
    const base = 330; // E4
    const voices: [number, number][] = [
      [1, 0],
      [1.5, 0.06],
    ];
    voices.forEach(([mult, delay], idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + delay;
      osc.frequency.setValueAtTime(base * mult, t0);
      osc.frequency.exponentialRampToValueAtTime(base * mult * 1.5, t0 + 0.22);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
      osc.connect(g).connect(this.sfx!);
      osc.start(t0);
      osc.stop(t0 + 0.36);
      // One claim covers the pair — release the single voice when the last ends.
      if (idx === voices.length - 1)
        osc.onended = () => {
          this.voices = Math.max(0, this.voices - 1);
        };
    });
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
    src.connect(lp).connect(g).connect(this.sfx!);
    src.start(now);
    this.release(src, now, 0.2);
  }
}
