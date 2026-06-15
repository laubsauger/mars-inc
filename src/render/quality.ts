// Quality tiers. V17: threat sim identical across tiers; only visuals degrade.
// Tier controls render-only budgets (particles, outline, shadow, max visible).

export type QualityTier = 'high' | 'medium' | 'low';

export interface TierBudget {
  tier: QualityTier;
  maxVisibleEnemies: number;
  maxVisualProjectiles: number;
  particles: boolean;
  dynamicOutlines: boolean;
  shadows: boolean;
  pixelRatioCap: number;
}

export const TIER_BUDGETS: Record<QualityTier, TierBudget> = {
  high: {
    tier: 'high',
    maxVisibleEnemies: 1500,
    maxVisualProjectiles: 10000,
    particles: true,
    dynamicOutlines: true,
    shadows: true,
    pixelRatioCap: 2,
  },
  medium: {
    tier: 'medium',
    maxVisibleEnemies: 800,
    maxVisualProjectiles: 4000,
    particles: true,
    dynamicOutlines: true,
    shadows: false,
    pixelRatioCap: 1.5,
  },
  low: {
    tier: 'low',
    maxVisibleEnemies: 350,
    maxVisualProjectiles: 1500,
    particles: false,
    dynamicOutlines: false,
    shadows: false,
    pixelRatioCap: 1,
  },
};

export interface DeviceHints {
  deviceMemoryGb?: number | undefined;
  hardwareConcurrency?: number | undefined;
  devicePixelRatio?: number | undefined;
}

/** Pick a starting tier from coarse device hints. Player can override later. */
export function detectTier(hints: DeviceHints): QualityTier {
  const mem = hints.deviceMemoryGb ?? 4;
  const cores = hints.hardwareConcurrency ?? 4;
  if (mem >= 8 && cores >= 8) return 'high';
  if (mem >= 4 && cores >= 4) return 'medium';
  return 'low';
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemoryGb: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    devicePixelRatio: window.devicePixelRatio,
  };
}
