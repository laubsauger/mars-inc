// Single source of truth for the player keybind reference. Rendered both in the
// first-run field briefing (Hud) and the Settings → Controls tab so the two never
// drift. Bindings are sourced from the input layer (core/input.ts) and the screen
// handlers (UpgradeScreen / GameOverScreen) — rebinding is a later pass, so this is
// the canonical list for now. Update keys HERE and both surfaces follow.

export const CONTROL_GROUPS: { group: string; rows: { keys: string[]; action: string }[] }[] = [
  {
    group: 'Combat',
    rows: [
      { keys: ['W', 'A', 'S', 'D'], action: 'Move' },
      { keys: ['↑', '↓', '←', '→'], action: 'Move (alt)' },
      { keys: ['Mouse'], action: 'Aim' },
      { keys: ['Left Click'], action: 'Fire (hold)' },
      { keys: ['Space', 'Right Click'], action: 'Throw grenade (hold to repeat)' },
      { keys: ['Ctrl'], action: 'Toggle auto-fire' },
      { keys: ['Shift'], action: 'Sprint' },
      { keys: ['E', 'F'], action: 'Pick up / equip' },
      { keys: ['X'], action: 'Drop weapon (back to sidearm)' },
      { keys: ['Esc'], action: 'Pause' },
    ],
  },
  {
    group: 'Upgrade draft',
    rows: [
      { keys: ['1', '2', '3'], action: 'Pick upgrade' },
      { keys: ['R'], action: 'Reroll' },
    ],
  },
  {
    group: 'Game over',
    rows: [
      { keys: ['Enter'], action: 'Restart run' },
      { keys: ['Esc'], action: 'Back to menu' },
    ],
  },
];

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded-sm border border-rust bg-pit/70 px-1.5 py-0.5 text-[11px] font-bold text-bone/90 shadow-[inset_0_-1px_0_rgba(0,0,0,0.5)]">
      {children}
    </kbd>
  );
}

/** The grouped keybind table. `only` restricts to a subset of group names (the
 *  briefing shows just Combat; Settings shows everything). */
export function ControlsReference({ only }: { only?: string[] }) {
  const groups = only ? CONTROL_GROUPS.filter((g) => only.includes(g.group)) : CONTROL_GROUPS;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.group} className="rounded-md border border-rust/70 bg-umber/80 px-6 py-3">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-gold">{g.group}</div>
          <div className="divide-y divide-rust/25">
            {g.rows.map((r) => (
              <div key={r.action} className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm text-bone/80">{r.action}</span>
                <span className="flex flex-wrap items-center justify-end gap-1">
                  {r.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
