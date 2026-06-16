// Level-up draft (§13.5, T41). Three cards rise over the frozen arena. Rarity is
// colour-coded; the player can lock a card, re-roll the rest, banish an option
// for the run, or skip the draft for a heal. Keyboard 1/2/3 selects.

import { useEffect, useState } from 'react';
import { useUiStore } from '../store';

const RARITY_STYLE: Record<
  string,
  { border: string; text: string; bar: string; glow: string; bg: string }
> = {
  common: {
    border: 'border-bone/45',
    text: 'text-bone/70',
    bar: 'bg-bone/45',
    glow: 'hover:shadow-[0_0_36px_rgba(244,228,212,0.14)]',
    bg: 'from-umber to-pit',
  },
  uncommon: {
    border: 'border-cyan',
    text: 'text-cyan',
    bar: 'bg-cyan',
    glow: 'hover:shadow-[0_0_42px_rgba(50,215,255,0.24)]',
    bg: 'from-umber to-cyan/18',
  },
  rare: {
    border: 'border-gold',
    text: 'text-gold',
    bar: 'bg-gold',
    glow: 'hover:shadow-[0_0_46px_rgba(255,210,63,0.28)]',
    bg: 'from-umber to-gold/20',
  },
  legendary: {
    border: 'border-elite',
    text: 'text-elite',
    bar: 'bg-elite',
    glow: 'hover:shadow-[0_0_50px_rgba(216,76,255,0.3)]',
    bg: 'from-umber to-elite/20',
  },
  corrupted: {
    border: 'border-bleed',
    text: 'text-bleed',
    bar: 'bg-bleed',
    glow: 'hover:shadow-[0_0_46px_rgba(255,59,48,0.28)]',
    bg: 'from-umber to-bleed/20',
  },
  prototype: {
    border: 'border-toxic',
    text: 'text-toxic',
    bar: 'bg-toxic',
    glow: 'hover:shadow-[0_0_46px_rgba(131,240,79,0.28)]',
    bg: 'from-umber to-toxic/20',
  },
};

function styleFor(rarity: string) {
  return RARITY_STYLE[rarity] ?? RARITY_STYLE.common!;
}

function contractClause(tags: readonly string[]): string {
  const primary = tags[0] ?? 'run';
  return `Clause ${primary.toUpperCase()}: payable in survival.`;
}

export function UpgradeScreen() {
  const draft = useUiStore((s) => s.draft);
  const choose = useUiStore((s) => s.chooseUpgrade);
  const reroll = useUiStore((s) => s.rerollDraft);
  const banish = useUiStore((s) => s.banishOption);
  const hold = useUiStore((s) => s.lockCard);
  const banishTag = useUiStore((s) => s.banishTag);
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
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-pit/90 px-4 font-mono backdrop-blur-md">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-2 flex w-fit items-center gap-2 border border-cyan/45 bg-pit/70 px-3 py-1 text-xs uppercase text-cyan shadow-[0_0_24px_rgba(50,215,255,0.16)]">
          <span className="h-1.5 w-1.5 bg-cyan" />
          LEVEL {draft.level}
          <span className="h-1.5 w-1.5 bg-cyan" />
        </div>
        <div className="text-3xl font-black text-bone drop-shadow-[0_0_20px_rgba(196,106,43,0.45)]">
          CHOOSE A CONTRACT
        </div>
        <div className="mt-2 text-xs uppercase text-dust">Mars Inc authorization pending</div>
      </div>

      <div className="flex max-w-full flex-col gap-4 md:flex-row">
        {draft.options.map((o, i) => {
          const isLocked = locked.has(o.id);
          const isHeld = draft.lockedId === o.id;
          const isUpgrade = o.level > 0;
          const style = styleFor(o.rarity);
          return (
            <div
              key={o.id}
              className={`group/card relative flex min-h-[30rem] w-[21rem] max-w-[92vw] flex-col overflow-hidden rounded-sm border-2 bg-pit bg-gradient-to-br p-5 shadow-[0_20px_60px_rgba(0,0,0,0.62),inset_0_0_0_1px_rgba(7,5,4,0.92)] transition ${style.border} ${style.bg} ${style.glow} ${isLocked ? 'ring-2 ring-gold' : isUpgrade ? 'ring-1 ring-gold/35' : ''}`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 ${style.bar}`} />
              {/* Level-up cards get a gold corner flag so a stack you already own is
                  instantly distinct from a brand-new pickup. */}
              {isUpgrade && (
                <div className="absolute -left-9 top-3 -rotate-45 bg-gold px-9 py-0.5 text-center text-[9px] font-black uppercase tracking-widest text-pit shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                  Upgrade
                </div>
              )}
              {/* Faint "approved" corner stamp — tucked into the very top-right corner,
                  behind the controls (pointer-events-none watermark), not floating down. */}
              <div className="pointer-events-none absolute right-1.5 top-1.5 rotate-12 border border-rust/40 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-bone/12">
                Approved
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-xs font-black uppercase tracking-widest ${style.text}`}>
                    {o.rarity}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase text-bone/42">Mars Inc contract</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {isHeld ? (
                    <span
                      title="Held for the next level-up"
                      className="flex h-7 items-center justify-center rounded-sm border border-elite bg-elite/15 px-2 text-[9px] font-black uppercase tracking-widest text-elite"
                    >
                      Held
                    </span>
                  ) : (
                    draft.locksLeft > 0 &&
                    draft.lockedId === null && (
                      <button
                        title={`Hold for the next draft (${draft.locksLeft} left)`}
                        onClick={() => hold(i)}
                        className="flex h-7 w-7 items-center justify-center rounded-sm border border-elite/45 bg-pit/82 text-xs font-black text-elite/70 transition hover:border-elite hover:text-elite focus:border-elite focus:outline-none"
                      >
                        ⊕
                      </button>
                    )
                  )}
                  <button
                    title={isLocked ? 'Unlock' : 'Keep across reroll'}
                    onClick={() => toggleLock(o.id)}
                    className={`flex h-7 w-7 items-center justify-center rounded-sm border bg-pit/82 text-xs font-black transition hover:border-gold hover:text-gold focus:border-gold focus:outline-none ${
                      isLocked ? 'border-gold text-gold' : 'border-bone/30 text-bone/50'
                    }`}
                  >
                    {isLocked ? '◆' : '◇'}
                  </button>
                  <span className="flex h-7 w-7 items-center justify-center rounded-sm border border-bone/30 bg-pit/76 text-xs font-black text-bone/70">
                    {i + 1}
                  </span>
                </div>
              </div>

              <button
                onClick={() => choose(i)}
                className="my-3 flex flex-1 flex-col gap-3 border-y border-rust/45 py-4 text-left focus:outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xl font-black leading-tight text-bone group-hover/card:text-sun">
                    {o.name}
                  </div>
                  {isUpgrade ? (
                    <span className="mt-0.5 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-gold bg-gold/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-gold shadow-[0_0_12px_rgba(255,210,63,0.25)]">
                      Lv {o.level}
                      <span className="text-gold/60">→</span>
                      {o.level + 1}
                    </span>
                  ) : (
                    <span className="mt-0.5 shrink-0 rounded-sm border border-cyan/55 bg-cyan/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-cyan">
                      New
                    </span>
                  )}
                </div>
                <div className="text-sm leading-5 text-bone/76">{o.description}</div>
                {o.changes.length > 0 && (
                  <div className="flex flex-col gap-0.5 rounded-sm border border-rust/40 bg-pit/55 px-2 py-1.5">
                    <div className="mb-0.5 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-bone/35">
                      <span>{isUpgrade ? 'Now' : 'Stat'}</span>
                      <span>{isUpgrade ? 'After' : 'Result'}</span>
                    </div>
                    {o.changes.map((c) => (
                      <div
                        key={c.label}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="uppercase tracking-wide text-bone/55">{c.label}</span>
                        <span className="font-black tabular-nums text-bone/85">
                          <span className="mr-1 text-bone/40">{c.from}</span>
                          <span className="mr-1 text-sun">→</span>
                          {c.to}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </button>

              {/* Tags row — clickable to banish a whole tag from the run pool (T71). */}
              <div className="-mt-1 mb-1 flex flex-wrap gap-1">
                {o.tags.map((t) =>
                  draft.tagBanishesLeft > 0 ? (
                    <button
                      key={t}
                      title={`Banish all "${t}" cards from this run (${draft.tagBanishesLeft} left)`}
                      onClick={() => banishTag(t)}
                      className="rounded-sm border border-rust/60 bg-pit/82 px-1.5 py-0.5 text-[10px] uppercase text-gold transition hover:border-bleed hover:text-bleed"
                    >
                      {t} ✕
                    </button>
                  ) : (
                    <span
                      key={t}
                      className="rounded-sm border border-rust/60 bg-pit/82 px-1.5 py-0.5 text-[10px] uppercase text-gold"
                    >
                      {t}
                    </span>
                  ),
                )}
              </div>

              <div className="text-[10px] uppercase text-bone/38">{contractClause(o.tags)}</div>

              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <button
                  onClick={() => choose(i)}
                  className={`rounded-sm border px-3 py-2 text-xs font-black uppercase tracking-widest transition ${style.border} ${style.text} bg-pit/82 hover:bg-bone/10 focus:outline-none`}
                >
                  Select
                </button>
                {draft.banishesLeft > 0 && !isLocked && (
                  <button
                    onClick={() => banish(i)}
                    className="flex items-center justify-center gap-1.5 rounded-sm border border-bleed/55 bg-pit/82 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-bleed/85 transition hover:border-bleed hover:bg-bleed/12 hover:text-bleed focus:border-bleed focus:outline-none"
                  >
                    <span className="text-xs leading-none">×</span>
                    <span>Banish</span>
                  </button>
                )}
              </div>

              {draft.banishesLeft <= 0 || isLocked ? (
                <div className="mt-2 h-[2.125rem] text-center text-[10px] uppercase text-bone/32">
                  {isLocked ? 'Locked across reroll' : 'No banishes left'}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm">
        <button
          disabled={draft.rerollsLeft <= 0}
          onClick={() => reroll([...locked])}
          className="rounded-sm border border-cyan/60 bg-pit/58 px-4 py-2 tracking-widest text-cyan transition enabled:hover:border-cyan enabled:hover:bg-cyan/12 disabled:opacity-40"
        >
          REROLL ({draft.rerollsLeft})
        </button>
        <button
          onClick={skip}
          className="rounded-sm border border-rust bg-pit/58 px-4 py-2 tracking-widest text-bone/70 transition hover:border-gold hover:bg-gold/10 hover:text-bone"
        >
          SKIP → HEAL
        </button>
      </div>
      <div className="mt-3 text-xs text-bone/40">
        click or press 1–{draft.options.length} · R to reroll · ◇ keep across reroll
        {draft.locksLeft > 0 ? ` · ⊕ hold for next (${draft.locksLeft})` : ''}
        {draft.tagBanishesLeft > 0
          ? ` · tag ✕ banishes a whole tag (${draft.tagBanishesLeft})`
          : ''}
      </div>
    </div>
  );
}
