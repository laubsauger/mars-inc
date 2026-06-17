// Shared Glory-Tree node tooltip BODY (name + owned/max + rarity badge +
// description + an optional action line). Extracted from GloryTree so the in-menu
// node tooltip AND the dev-menu permanent hover render the explanatory text from ONE
// source — no duplicated markup. The Glory Tree keeps its own reveal/lock chrome and
// passes the buy/locked/maxed line via `action`; the dev menu shows it always-revealed
// with a plain owned line. Colours by branch (small local tint map ⊥ the tree's).

import type { ReactNode } from 'react';
import type { PermanentView } from '../store-types';

// Branch → accent classes (mirrors GloryTree's BRANCH_STYLE text/border for tooltips).
const BRANCH_TINT: Record<string, { text: string; border: string }> = {
  arsenal: { text: 'text-bleed', border: 'border-bleed' },
  biology: { text: 'text-toxic', border: 'border-toxic' },
  mobility: { text: 'text-cyan', border: 'border-cyan' },
  command: { text: 'text-elite', border: 'border-elite' },
  arena: { text: 'text-sun', border: 'border-sun' },
  infamy: { text: 'text-ember', border: 'border-ember' },
};

function rarityBadge(rarity: string): { label: string; cls: string } {
  if (rarity === 'legendary') return { label: '◆ Keystone', cls: 'text-legendary' };
  if (rarity === 'rare') return { label: '◈ Rare', cls: 'text-bone/70' };
  return { label: 'Common', cls: 'text-bone/40' };
}

export interface PermanentTooltipBodyProps {
  permanent: PermanentView;
  /** Action line (Glory Tree: buy cost / locked / maxed). Omitted → a plain owned row. */
  action?: ReactNode;
}

export function PermanentTooltipBody({ permanent: p, action }: PermanentTooltipBodyProps) {
  const tint = BRANCH_TINT[p.branch] ?? { text: 'text-bone/70', border: 'border-bone/20' };
  const badge = rarityBadge(p.rarity);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-black uppercase ${tint.text}`}>{p.name}</span>
        <span className="shrink-0 text-xs text-bone/70">
          {p.owned}/{p.maxLevel}
        </span>
      </div>
      <div className={`mt-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${badge.cls}`}>
        {badge.label}
      </div>
      <div className="mt-1 text-[11px] leading-4 text-bone/75">{p.description}</div>
      {action !== undefined ? (
        <div className="mt-2 text-[11px] font-bold text-gold">{action}</div>
      ) : (
        <div className="mt-2 text-[10px] uppercase tracking-wide text-bone/45">{p.branch}</div>
      )}
    </>
  );
}

/** Exposed so the dev tooltip can border-match the branch without its own map. */
export function permanentBranchBorder(branch: string): string {
  return (BRANCH_TINT[branch] ?? { border: 'border-bone/20' }).border;
}
