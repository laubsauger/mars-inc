// Developer overlay (T4, §20). DOM panel — dev-only, ⊥ combat HUD. Toggled with `~`.

import type { QualityTier } from '../render/quality';

export interface OverlayMetrics {
  fps: number;
  frameMs: number;
  simMs: number;
  renderMs: number;
  enemies: number;
  maxEnemies: number;
  projectiles: number;
  particles: number;
  drawCalls: number;
  tier: QualityTier;
  seed: number;
}

export class DevOverlay {
  private el: HTMLDivElement;
  private visible = true;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:8px',
      'padding:6px 8px',
      'background:rgba(10,6,4,0.78)',
      'border:1px solid #7a3b22',
      'font:11px ui-monospace,monospace',
      'color:#f4e4d4',
      'white-space:pre',
      'pointer-events:none',
      'z-index:1000',
    ].join(';');
    parent.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') this.toggle();
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  update(m: OverlayMetrics): void {
    if (!this.visible) return;
    this.el.textContent = [
      `MARS PIT  tier:${m.tier}  seed:${m.seed}`,
      `fps ${m.fps.toFixed(0).padStart(4)}  frame ${m.frameMs.toFixed(2)}ms`,
      `sim ${m.simMs.toFixed(2)}ms  render ${m.renderMs.toFixed(2)}ms`,
      `enemies ${m.enemies}/${m.maxEnemies}  proj ${m.projectiles}  fx ${m.particles}  draws ${m.drawCalls}`,
    ].join('\n');
  }
}
