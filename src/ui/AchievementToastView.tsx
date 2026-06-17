// Achievement-unlock toast (T-ach). A rich card that slides in from the top on
// every unlock and auto-dismisses; driven by the store's `achievement` slice (id
// bumps per unlock, queued by the boot tracker so several stagger). Rendered above
// every screen (ui-root) so it shows whether you're mid-arena or on the game-over /
// menu screens. Pure view — reads the store, never writes.

import { useEffect, useState } from 'react';
import { useUiStore, type AchievementToast } from './store';

const TIER: Record<string, { border: string; text: string; glow: string; label: string }> = {
  expected: {
    border: 'border-cyan/70',
    text: 'text-cyan',
    glow: 'shadow-[0_14px_44px_rgba(0,0,0,0.6),0_0_30px_rgba(50,215,255,0.28)]',
    label: 'Achievement',
  },
  hard: {
    border: 'border-gold/80',
    text: 'text-gold',
    glow: 'shadow-[0_14px_44px_rgba(0,0,0,0.6),0_0_34px_rgba(255,210,63,0.4)]',
    label: 'Rare Achievement',
  },
  weird: {
    border: 'border-elite/80',
    text: 'text-elite',
    glow: 'shadow-[0_14px_44px_rgba(0,0,0,0.6),0_0_34px_rgba(216,76,255,0.38)]',
    label: 'Oddity Unlocked',
  },
};

export function AchievementToastView() {
  const ach = useUiStore((s) => s.achievement);
  const [shown, setShown] = useState<AchievementToast | null>(null);
  useEffect(() => {
    if (!ach) return;
    setShown(ach);
    const t = setTimeout(() => setShown(null), 4200);
    return () => clearTimeout(t);
    // Re-fire whenever a new unlock id arrives.
  }, [ach?.id, ach]);
  if (!shown) return null;
  const tier = TIER[shown.tier] ?? TIER.expected!;
  return (
    <div className="pointer-events-none fixed left-1/2 top-6 z-[58] -translate-x-1/2 px-3">
      <div
        key={shown.id}
        className={`ach-toast flex max-w-[92vw] items-center gap-4 rounded-sm border-2 bg-pit/95 px-5 py-3 font-mono backdrop-blur-sm ${tier.border} ${tier.glow}`}
      >
        <div
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-sm border bg-pit/55 text-4xl ${tier.border} ${tier.text} drop-shadow-[0_0_8px_currentColor]`}
        >
          {shown.icon}
        </div>
        <div className="min-w-0">
          <div className={`text-[10px] font-black uppercase tracking-[0.36em] ${tier.text}`}>
            ★ {tier.label}
          </div>
          <div className="mt-0.5 truncate text-xl font-black text-bone">{shown.name}</div>
          <div className="mt-0.5 text-xs leading-snug text-bone/72">{shown.desc}</div>
        </div>
      </div>
    </div>
  );
}
