// Keyboard input (§I.input). Reads into a sampled snapshot so the fixed sim
// reads stable state per step, decoupled from DOM event timing.

export interface InputSnapshot {
  /** Normalized-ish raw axis [-1,1] each; sim normalizes diagonals (V4). */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  pause: boolean;
  /** Edge-triggered once per press: equip the weapon crate under the player. */
  pickup: boolean;
  /** Primary fire held (left mouse). Auto-fire toggle ORs in via `autoFire`. */
  fire: boolean;
  /** Edge-triggered once per press (Space OR right mouse): throw a grenade at the cursor. */
  grenade: boolean;
  /** Space / right mouse HELD: auto-throw grenades on cooldown (in addition to the edge). */
  grenadeHeld: boolean;
  /** Edge-triggered once per press (Ctrl): toggle persistent auto-fire. */
  toggleAuto: boolean;
  /** Mouse position in CSS pixels; -1 when pointer never seen. */
  mouseX: number;
  mouseY: number;
  mouseInside: boolean;
  /** World-space aim point on the arena floor, filled by the render layer
   *  (which owns the camera) before the snapshot reaches the sim. */
  aimX: number;
  aimZ: number;
  hasAim: boolean;
}

const MOVE_KEYS: Record<string, [axis: 'x' | 'z', dir: number]> = {
  KeyW: ['z', -1],
  ArrowUp: ['z', -1],
  KeyS: ['z', 1],
  ArrowDown: ['z', 1],
  KeyA: ['x', -1],
  ArrowLeft: ['x', -1],
  KeyD: ['x', 1],
  ArrowRight: ['x', 1],
};

export class Input {
  private down = new Set<string>();
  private pausePressed = false;
  private pickupPressed = false;
  private leftDown = false; // primary fire held (left mouse button)
  private grenadePressed = false; // edge: Space / right mouse → grenade
  private rightDown = false; // right mouse HELD → auto-throw grenades on cooldown
  private autoPressed = false; // edge: Ctrl → toggle auto-fire
  private mouseX = -1;
  private mouseY = -1;
  private mouseInside = false;

  attach(target: Window = window): () => void {
    const onDown = (e: KeyboardEvent): void => {
      if (e.code in MOVE_KEYS || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
      }
      if (e.code === 'Escape' && !this.down.has('Escape')) this.pausePressed = true;
      if ((e.code === 'KeyE' || e.code === 'KeyF') && !this.down.has(e.code)) {
        this.pickupPressed = true;
      }
      // Space → GRENADE (edge throws once; held auto-throws on cooldown). Mirrors the
      // right-mouse bind so touchpad players never need the awkward right-click.
      if (e.code === 'Space') {
        e.preventDefault(); // don't scroll the page
        if (!this.down.has('Space')) this.grenadePressed = true; // edge → instant first throw
      }
      // Ctrl → toggle persistent auto-fire (moved off Space, which is now grenade).
      if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !this.down.has(e.code)) {
        e.preventDefault();
        this.autoPressed = true;
      }
      this.down.add(e.code);
    };
    const onUp = (e: KeyboardEvent): void => {
      this.down.delete(e.code);
    };
    const onBlur = (): void => {
      this.down.clear();
      this.mouseInside = false;
      this.leftDown = false; // release held buttons so nothing keeps firing off-window
      this.rightDown = false;
    };
    const onMove = (e: MouseEvent): void => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.mouseInside = true;
    };
    const onLeave = (): void => {
      this.mouseInside = false;
    };
    const onMouseDown = (e: MouseEvent): void => {
      if (e.button === 0) {
        this.leftDown = true; // primary fire
      } else if (e.button === 2) {
        this.grenadePressed = true; // right → grenade (edge — instant first throw)
        this.rightDown = true; // ...and HOLD → keep throwing on cooldown
      }
    };
    const onMouseUp = (e: MouseEvent): void => {
      if (e.button === 0) this.leftDown = false;
      else if (e.button === 2) this.rightDown = false;
    };
    const onContext = (e: Event): void => e.preventDefault(); // no right-click menu
    target.addEventListener('keydown', onDown);
    target.addEventListener('keyup', onUp);
    target.addEventListener('blur', onBlur);
    target.addEventListener('mousemove', onMove);
    target.addEventListener('mousedown', onMouseDown);
    target.addEventListener('mouseup', onMouseUp);
    target.addEventListener('contextmenu', onContext);
    target.document.addEventListener('mouseleave', onLeave);
    return () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
      target.removeEventListener('mousemove', onMove);
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('mouseup', onMouseUp);
      target.removeEventListener('contextmenu', onContext);
      target.document.removeEventListener('mouseleave', onLeave);
    };
  }

  /** Sample current state. `pause` edge-triggers once per press. */
  sample(): InputSnapshot {
    let moveX = 0;
    let moveZ = 0;
    for (const code of this.down) {
      const m = MOVE_KEYS[code];
      if (!m) continue;
      if (m[0] === 'x') moveX += m[1];
      else moveZ += m[1];
    }
    const pause = this.pausePressed;
    this.pausePressed = false;
    const pickup = this.pickupPressed;
    this.pickupPressed = false;
    const grenade = this.grenadePressed;
    this.grenadePressed = false;
    const toggleAuto = this.autoPressed;
    this.autoPressed = false;
    return {
      moveX: Math.max(-1, Math.min(1, moveX)),
      moveZ: Math.max(-1, Math.min(1, moveZ)),
      sprint: this.down.has('ShiftLeft') || this.down.has('ShiftRight'),
      pause,
      pickup,
      fire: this.leftDown,
      grenade,
      grenadeHeld: this.rightDown || this.down.has('Space'), // right-mouse OR Space held
      toggleAuto,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      mouseInside: this.mouseInside,
      // aim filled by the render layer (owns the camera) before sim reads it.
      aimX: 0,
      aimZ: 0,
      hasAim: false,
    };
  }
}
