// Reusable character/build sheet (T43). One component, three homes: the
// game-over screen, the pause menu, and the warrior panel. Shows the live
// weapon + attribute sheet + the abilities (upgrades) the run has accrued.

import type { SheetView } from './store';

// Rarity → accent colour, mirrors the draft card palette so a card you picked
// reads the same hue in the build sheet.
const RARITY_TEXT: Record<string, string> = {
  common: 'text-bone/80',
  uncommon: 'text-cyan',
  rare: 'text-gold',
  legendary: 'text-elite',
  corrupted: 'text-bleed',
  prototype: 'text-toxic',
};

export function RunSheet({ sheet, compact = false }: { sheet: SheetView; compact?: boolean }) {
  return (
    // Attributes is a short fixed column; abilities take the remaining width so a
    // long build list isn't crammed into a narrow half (minmax(0,…) lets the inner
    // multi-column grid shrink instead of overflowing).
    <div className="grid grid-cols-[18rem_minmax(0,1fr)] gap-3 font-mono">
      {/* Attributes */}
      <div className="rounded-md border border-rust/40 bg-umber/40 p-4">
        <div className="mb-2 flex items-baseline justify-between border-b border-rust/30 pb-1">
          <span className="text-[11px] tracking-[0.3em] text-gold">ATTRIBUTES</span>
          <span className="text-[11px] text-bone/70">{sheet.weapon}</span>
        </div>
        <div className="flex flex-col gap-1">
          {sheet.attributes.map((a) => (
            <div key={a.label} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-dust">{a.label}</span>
              <span className="font-bold text-bone tabular-nums">{a.value}</span>
            </div>
          ))}
        </div>
        {/* Conditional buffs FIRING right now (Momentum, rage, point-blank, …) so the
            "current" attribute values above are explained at a glance. */}
        {sheet.activeBuffs.length > 0 && (
          <div className="mt-3 border-t border-rust/30 pt-2">
            <div className="mb-1 text-[11px] tracking-[0.3em] text-toxic">ACTIVE NOW</div>
            <div className="flex flex-col gap-1">
              {sheet.activeBuffs.map((b) => (
                <div key={b.label} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-toxic/80">{b.label}</span>
                  <span className="font-bold text-toxic tabular-nums">{b.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Abilities / upgrades */}
      <div className="rounded-md border border-rust/40 bg-umber/40 p-4">
        <div className="mb-2 border-b border-rust/30 pb-1 text-[11px] tracking-[0.3em] text-gold">
          ABILITIES — {sheet.upgrades.length}
        </div>
        <div
          className={`grid auto-rows-min grid-cols-1 gap-x-5 gap-y-1.5 overflow-y-auto pr-1 sm:grid-cols-2 ${
            compact ? 'max-h-[46vh]' : 'max-h-[60vh]'
          }`}
        >
          {sheet.upgrades.length === 0 && <span className="text-xs text-bone/40">none yet</span>}
          {sheet.upgrades.map((u) => {
            const maxed = u.level >= u.maxLevel;
            return (
              <div key={u.name} className="border-b border-rust/15 pb-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={`font-bold ${RARITY_TEXT[u.rarity] ?? 'text-bone/85'}`}>
                    {u.name}
                  </span>
                  <span
                    className={`shrink-0 tabular-nums text-[11px] font-black ${maxed ? 'text-gold' : 'text-bone/55'}`}
                  >
                    Lv {u.level}
                    <span className="text-bone/30">/{u.maxLevel}</span>
                    {maxed ? ' · MAX' : ''}
                  </span>
                </div>
                {u.description && (
                  <div className="mt-0.5 text-[11px] leading-snug text-bone/55">
                    {u.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
