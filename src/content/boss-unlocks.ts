// First-kill unlocks (T48, V24). Defeating a boss for the FIRST time unlocks a
// chunk of BREADTH — a Glory-tree branch, the next act, a prestige seed — banked
// IMMEDIATELY at kill time (V40) so it survives a surrender/quit. Each entry maps a
// BossDef id → an unlock key (consumed by gates elsewhere: arena selector, the
// boss-gated Glory-tree branches T47) + a player-facing label for the banner.
//
// Data only — no logic. main applies these on the first-kill edge.

export interface FirstKillUnlock {
  /** Persisted `unlocks[key]` flag set on the first kill. */
  readonly key: string;
  /** Banner label shown when it unlocks. */
  readonly label: string;
}

export const FIRST_KILL_UNLOCKS: Record<string, FirstKillUnlock> = {
  // ── Act 1 ──
  'foreman-krill': { key: 'tree:arsenal-foreman', label: 'Foreman Arsenal — Glory Tree' },
  'repo-sovereign': { key: 'tree:arsenal-sovereign', label: 'Sovereign Contracts — Glory Tree' },
  // The Act-1 final ALSO opens Act 2 (mirrors the legacy `boss-beaten` gate).
  'gatekeeper-of-phobos': { key: 'act:rust-crown', label: 'Act II — Rust Crown' },
  // ── Act 2 ──
  'magma-notary': { key: 'tree:biology-magma', label: 'Magma Biology — Glory Tree' },
  'frostbite-magnate': { key: 'tree:mobility-frost', label: 'Frostbite Mobility — Glory Tree' },
  'devourer-prime': { key: 'prestige:seed', label: 'Prestige Research unlocked' },
};

export function firstKillUnlock(bossId: string): FirstKillUnlock | undefined {
  return FIRST_KILL_UNLOCKS[bossId];
}
