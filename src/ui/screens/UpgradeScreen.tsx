// Level-up draft (§13.5). Three cards rise over the frozen arena. Each subscribes
// to nothing heavy — reads the draft slice once. Keyboard 1/2/3 also selects.

import { useEffect } from 'react';
import { useUiStore } from '../store';

const RARITY_RING: Record<string, string> = {
  common: 'border-bone/40',
  uncommon: 'border-cyan',
  rare: 'border-elite',
};

export function UpgradeScreen() {
  const draft = useUiStore((s) => s.draft);
  const choose = useUiStore((s) => s.chooseUpgrade);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= draft.options.length) choose(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft.options.length, choose]);

  if (!draft.open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-pit/70 font-mono">
      <div className="mb-6 text-center">
        <div className="text-sm tracking-[0.3em] text-cyan">LEVEL {draft.level}</div>
        <div className="text-2xl font-bold tracking-widest text-bone">CHOOSE A CONTRACT</div>
      </div>
      <div className="flex gap-4">
        {draft.options.map((o, i) => (
          <button
            key={o.id}
            onClick={() => choose(i)}
            className={`group flex w-60 flex-col gap-3 rounded-md border-2 ${
              RARITY_RING[o.rarity] ?? 'border-bone/40'
            } bg-umber/90 p-5 text-left transition hover:-translate-y-1 hover:border-gold focus:outline-none focus:border-gold`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-dust">{o.rarity}</span>
              <span className="flex h-6 w-6 items-center justify-center rounded border border-bone/30 text-xs text-bone/70">
                {i + 1}
              </span>
            </div>
            <div className="text-lg font-bold text-bone">{o.name}</div>
            <div className="text-sm text-bone/70">{o.description}</div>
            <div className="mt-auto flex flex-wrap gap-1">
              {o.tags.map((t) => (
                <span key={t} className="rounded bg-pit/60 px-1.5 py-0.5 text-[10px] text-gold">
                  {t}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-6 text-xs text-bone/50">click or press 1–{draft.options.length}</div>
    </div>
  );
}
