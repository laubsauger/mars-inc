// Art tokens — single render-side source of truth (T37 step 1, per
// docs/art-direction.md "Martian Pulp Brutalism"). Render-only: ⊥ sim imports.
// Views consume these instead of ad-hoc hex so a palette change is one edit.
// Tailwind mirrors the gameplay/base hues in src/ui/index.css @theme.

import { Color } from 'three';

/** Base world — burnt umber → brass. Keep arena low-contrast so combat wins. */
export const BASE = {
  umberShadow: '#2a1712',
  oldRust: '#5b2b1d',
  oxidizedIron: '#8f3f24',
  marsDust: '#c46a2b',
  brass: '#d8b46a',
} as const;

/** Ink & paper — outlines and hard highlights. */
export const INK = {
  nearBlack: '#070504',
  warmLine: '#241814',
  sunHigh: '#f0c879',
  bone: '#f5ede0', // brightest paper highlight — medkit cross, reads over blood
} as const;

/** Gameplay accents — saturated, reserved for combat state readability. */
export const ACCENT = {
  kineticGold: '#ffd23f', // muzzle / pickups
  shieldCyan: '#32d7ff',
  healthRed: '#ff3b30',
  toxicGreen: '#83f04f',
  xpGreen: '#33f28c', // XP shards — emerald, blue-green so it reads ⊥ toxic enemies
  petSpectral: '#9aa8ff', // risen Gravedigger pets — cold spectral periwinkle "ally" glow
  eliteMagenta: '#d84cff',
  laserRed: '#ff2a3a', // Lance Sentinel turret + its charging laser beam
  devourerViolet: '#7b3fd6', // Gargantuan — deep violet, hulking + ⊥ the other crowds
} as const;

/** Toon ramp band thresholds (lit fraction → next band). For TSL material at T37. */
export const TOON_BANDS = [0.25, 0.6] as const;

/** Inverted-hull outline thickness presets by prop importance. */
export const OUTLINE = {
  hero: 0.08,
  prop: 0.06,
  enemy: 0.0, // crowds use color blocking, not lines (art doc pillar 1)
} as const;

/** Cached Three.Color instances (avoid per-construction churn). */
export const COL = {
  umberShadow: new Color(BASE.umberShadow),
  oldRust: new Color(BASE.oldRust),
  oxidizedIron: new Color(BASE.oxidizedIron),
  marsDust: new Color(BASE.marsDust),
  brass: new Color(BASE.brass),
  nearBlack: new Color(INK.nearBlack),
  warmLine: new Color(INK.warmLine),
  sunHigh: new Color(INK.sunHigh),
  bone: new Color(INK.bone),
  kineticGold: new Color(ACCENT.kineticGold),
  shieldCyan: new Color(ACCENT.shieldCyan),
  healthRed: new Color(ACCENT.healthRed),
  toxicGreen: new Color(ACCENT.toxicGreen),
  xpGreen: new Color(ACCENT.xpGreen),
  petSpectral: new Color(ACCENT.petSpectral),
  eliteMagenta: new Color(ACCENT.eliteMagenta),
  laserRed: new Color(ACCENT.laserRed),
  devourerViolet: new Color(ACCENT.devourerViolet),
} as const;
