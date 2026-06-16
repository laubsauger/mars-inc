// Level-up draft (§13.5, T41). Three cards rise over the frozen arena. Rarity is
// colour-coded; the player can lock a card, re-roll the rest, banish an option
// for the run, or skip the draft for a heal. Keyboard 1/2/3 selects.

import { useEffect, useState } from 'react';
import { useUiStore } from '../store';

const RARITY_RING: Record<string, string> = {
  common: 'border-bone/40',
  uncommon: 'border-cyan',
  rare: 'border-gold',
  legendary: 'border-elite',
  corrupted: 'border-bleed',
  prototype: 'border-toxic',
};
const RARITY_TEXT: Record<string, string> = {
  common: 'text-bone/60',
  uncommon: 'text-cyan',
  rare: 'text-gold',
  legendary: 'text-elite',
  corrupted: 'text-bleed',
  prototype: 'text-toxic',
};

export function UpgradeScreen() {
  const draft = useUiStore((s) => s.draft);
  const choose = useUiStore((s) => s.chooseUpgrade);
  const reroll = useUiStore((s) => s.rerollDraft);
  const banish = useUiStore((s) => s.banishOption);
  const skip = useUiStore((s) => s.skipDraft);

  const [locked, setLocked] = useState<Set<string>>(new Set());
  // Reset locks whenever a fresh draft opens (level changes or list identity).
  const key = draft.options.map((o) => o.id).join('|');
  useEffect(() => setLocked(new Set()), [key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= draft.options.length) choose(n - 1);
      else if (e.key.toLowerCase() === 'r') reroll([...locked]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft.options.length, choose, reroll, locked]);

  if (!draft.open) return null;

  const toggleLock = (id: string) =>
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-pit/70 font-mono">
      <div className="mb-6 text-center">
        <div className="text-sm tracking-[0.3em] text-cyan">LEVEL {draft.level}</div>
        <div className="text-2xl font-bold tracking-widest text-bone">CHOOSE A CONTRACT</div>
      </div>

      <div className="flex gap-4">
        {draft.options.map((o, i) => {
          const isLocked = locked.has(o.id);
          return (
            <div
              key={o.id}
              className={`relative flex w-60 flex-col gap-3 rounded-md border-2 ${
                RARITY_RING[o.rarity] ?? 'border-bone/40'
              } bg-umber/90 p-5 ${isLocked ? 'ring-2 ring-gold' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs uppercase tracking-widest ${RARITY_TEXT[o.rarity]}`}>
                  {o.rarity}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    title={isLocked ? 'Unlock' : 'Lock across reroll'}
                    onClick={() => toggleLock(o.id)}
                    className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] ${
                      isLocked ? 'border-gold text-gold' : 'border-bone/30 text-bone/50'
                    }`}
                  >
                    {isLocked ? '◆' : '◇'}
                  </button>
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-bone/30 text-[10px] text-bone/70">
                    {i + 1}
                  </span>
                </div>
              </div>

              <button onClick={() => choose(i)} className="flex flex-col gap-3 text-left">
                <div className="text-lg font-bold text-bone">{o.name}</div>
                <div className="text-sm text-bone/70">{o.description}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {o.tags.map((t) => (
                    <span key={t} className="rounded bg-pit/60 px-1.5 py-0.5 text-[10px] text-gold">
                      {t}
                    </span>
                  ))}
                </div>
              </button>

              {draft.banishesLeft > 0 && !isLocked && (
                <button
                  onClick={() => banish(i)}
                  className="mt-auto text-[10px] uppercase tracking-widest text-bleed/70 hover:text-bleed"
                >
                  ✕ banish
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm">
        <button
          disabled={draft.rerollsLeft <= 0}
          onClick={() => reroll([...locked])}
          className="rounded border border-cyan/60 px-4 py-1.5 tracking-widest text-cyan transition enabled:hover:bg-cyan/10 disabled:opacity-40"
        >
          REROLL ({draft.rerollsLeft})
        </button>
        <button
          onClick={skip}
          className="rounded border border-rust px-4 py-1.5 tracking-widest text-bone/70 transition hover:border-gold hover:text-bone"
        >
          SKIP → HEAL
        </button>
      </div>
      <div className="mt-3 text-xs text-bone/40">
        click or press 1–{draft.options.length} · R to reroll · ◇ to lock
      </div>
    </div>
  );
}
