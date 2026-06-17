// Act structure (T75, V36). The DEFAULT run is a FINITE single playthrough: an
// ordered act of [opening waves → Miniboss I → waves → Miniboss II → waves →
// Final Boss]. The wave director (which already owns the wave rhythm + themed
// milestone bursts) drives the boss SEQUENCE from this data; on the final boss's
// death the run is won (the player may opt into endless Overrun instead, T50).
//
// `index` matches `ArenaDef.act` so the active arena selects the act. Each act
// fields a DISTINCT boss roster (V36). Timing is in ESCALATION seconds for the
// first boss (the same stretched clock the rest of the director reads) and REAL
// seconds for the gap after a boss falls.

import {
  type BossDef,
  FOREMAN_KRILL_BOSS,
  REPO_SOVEREIGN_BOSS,
  GATEKEEPER_BOSS,
  MAGMA_NOTARY_BOSS,
  FROSTBITE_MAGNATE_BOSS,
  DEVOURER_PRIME_BOSS,
} from './bosses';

export interface ActDef {
  /** Matches `ArenaDef.act`. */
  readonly index: number;
  readonly displayName: string;
  /** Ordered roster: [Miniboss I, Miniboss II, Final Boss]. The LAST is the final. */
  readonly bosses: readonly BossDef[];
  /** Escalation seconds before the first miniboss arms (× TIMELINE_STRETCH = real). */
  readonly firstBossAt: number;
  /** REAL seconds after a boss falls before the next one arms (the breather). */
  readonly interBossGap: number;
}

export const ACT_1: ActDef = {
  index: 1,
  displayName: 'Cold Vault',
  bosses: [FOREMAN_KRILL_BOSS, REPO_SOVEREIGN_BOSS, GATEKEEPER_BOSS],
  firstBossAt: 55,
  interBossGap: 35,
};

export const ACT_2: ActDef = {
  index: 2,
  displayName: 'Rust Crown',
  bosses: [MAGMA_NOTARY_BOSS, FROSTBITE_MAGNATE_BOSS, DEVOURER_PRIME_BOSS],
  firstBossAt: 50,
  interBossGap: 32,
};

export const ACTS: readonly ActDef[] = [ACT_1, ACT_2];

/** The act for an arena's `act` index. Acts are core content (no convenience
 *  fallback): an unknown index is a content bug, so throw rather than mask it. */
export function actFor(index: number): ActDef {
  const a = ACTS.find((act) => act.index === index);
  if (!a) throw new Error(`No ActDef for act index ${index}`);
  return a;
}
