// Reusable character/build sheet (T43). One component, three homes: the
// game-over screen, the pause menu, and the warrior panel. Shows the live
// weapon + attribute sheet + the abilities (upgrades) the run has accrued.

import type { SheetView } from './store';

export function RunSheet({ sheet, compact = false }: { sheet: SheetView; compact?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 font-mono">
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
      </div>

      {/* Abilities / upgrades */}
      <div className="rounded-md border border-rust/40 bg-umber/40 p-4">
        <div className="mb-2 border-b border-rust/30 pb-1 text-[11px] tracking-[0.3em] text-gold">
          ABILITIES — {sheet.upgrades.length}
        </div>
        <div
          className={`flex flex-col gap-1 overflow-y-auto pr-1 ${compact ? 'max-h-40' : 'max-h-56'}`}
        >
          {sheet.upgrades.length === 0 && <span className="text-xs text-bone/40">none yet</span>}
          {sheet.upgrades.map((u) => (
            <div key={u.name} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-bone/85">{u.name}</span>
              <span className="text-gold tabular-nums">Lv{u.level}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
