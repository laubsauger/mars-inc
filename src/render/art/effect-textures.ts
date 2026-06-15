// Procedural placeholder effect textures (T16 / art doc "Projectile/effect atlas").
// Render/content ownership, not sim. Small, generated once; production art can
// swap these for hand-painted cards later. Iconic top-down silhouettes only.

import { CanvasTexture, type Texture } from 'three';

function canvas(size = 128): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function texFrom(c: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/** Additive starburst — muzzle flash. White core, spiked rays. */
export function starTexture(): Texture {
  const { c, ctx } = canvas();
  const m = 64;
  const grad = ctx.createRadialGradient(m, m, 0, m, m, 60);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,230,150,0.9)');
  grad.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 60 : 22;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](m + Math.cos(a) * r, m + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  return texFrom(c);
}

/** Additive ring — impact shockwave. Bright thin annulus. */
export function ringTexture(): Texture {
  const { c, ctx } = canvas();
  const m = 64;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(m, m, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,140,0.6)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(m, m, 44, 0, Math.PI * 2);
  ctx.stroke();
  return texFrom(c);
}

/** Soft disc — dust poof / sprint comma. */
export function puffTexture(): Texture {
  const { c, ctx } = canvas();
  const m = 64;
  const grad = ctx.createRadialGradient(m, m, 0, m, m, 60);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(m, m, 60, 0, Math.PI * 2);
  ctx.fill();
  return texFrom(c);
}
