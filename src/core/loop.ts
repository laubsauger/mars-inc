// Fixed-timestep simulation loop. V1: sim steps at fixed dt; render decoupled,
// interpolates by alpha. ⊥ sim coupled to frame rate.

export const FIXED_DT = 1 / 60;
const MAX_FRAME_DELTA = 0.1; // clamp spiral-of-death after tab stalls

export interface LoopCallbacks {
  /** Advance authoritative sim by exactly FIXED_DT. */
  step(dt: number): void;
  /** Draw. alpha ∈ [0,1) = fraction into next step, for interpolation. */
  render(alpha: number): void;
}

export interface LoopHandle {
  start(): void;
  stop(): void;
  /** Time scale: 0 = frozen (upgrade screen), 1 = normal. */
  setTimeScale(scale: number): void;
  readonly running: boolean;
}

/**
 * Pure stepping math — testable without a clock.
 * Returns number of fixed steps to run and leftover accumulator.
 */
export function stepCount(
  accumulator: number,
  frameDelta: number,
  timeScale: number,
  fixedDt: number = FIXED_DT,
  maxFrameDelta: number = MAX_FRAME_DELTA,
): { steps: number; accumulator: number } {
  const clamped = Math.min(frameDelta, maxFrameDelta) * timeScale;
  let acc = accumulator + clamped;
  let steps = 0;
  while (acc >= fixedDt) {
    acc -= fixedDt;
    steps++;
  }
  return { steps, accumulator: acc };
}

type Now = () => number;

export function createLoop(cb: LoopCallbacks, now: Now = () => performance.now()): LoopHandle {
  let accumulator = 0;
  let previous = 0;
  let timeScale = 1;
  let running = false;
  let raf = 0;

  const frame = (): void => {
    if (!running) return;
    const t = now();
    const frameDelta = (t - previous) / 1000;
    previous = t;

    const res = stepCount(accumulator, frameDelta, timeScale);
    accumulator = res.accumulator;
    for (let i = 0; i < res.steps; i++) cb.step(FIXED_DT);

    const alpha = accumulator / FIXED_DT;
    cb.render(alpha);

    raf = requestAnimationFrame(frame);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      previous = now();
      raf = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(raf);
    },
    setTimeScale(scale: number): void {
      timeScale = Math.max(0, scale);
    },
    get running(): boolean {
      return running;
    },
  };
}
