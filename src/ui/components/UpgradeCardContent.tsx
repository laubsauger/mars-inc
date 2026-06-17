// Shared upgrade-card FACE (the explanatory content: name + level badge +
// description + stat-change grid). Extracted from UpgradeScreen so the in-game draft
// card AND the dev-menu hover tooltip render from ONE source — no duplicated markup
// or copy-pasted descriptions. Pure presentational (no handlers); the draft screen
// wraps it in its interactive chrome (lock/banish/select), the dev tooltip just shows
// it read-only. `changes` is optional (the dev catalog has no live stat preview).

import { Fragment } from 'react';

export interface UpgradeCardContentProps {
  name: string;
  description: string;
  /** Levels already owned (0 = a new card → "New" badge, else "Lv n → n+1"). */
  level: number;
  changes?: { label: string; from: string; to: string }[];
}

export function UpgradeCardContent({
  name,
  description,
  level,
  changes = [],
}: UpgradeCardContentProps) {
  const isUpgrade = level > 0;
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xl font-black leading-tight text-bone group-hover/card:text-sun">
          {name}
        </div>
        {isUpgrade ? (
          <span className="mt-0.5 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-gold bg-gold/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-gold shadow-[0_0_12px_rgba(255,210,63,0.25)]">
            Lv {level}
            <span className="text-gold/60">→</span>
            {level + 1}
          </span>
        ) : (
          <span className="mt-0.5 shrink-0 rounded-sm border border-cyan/55 bg-cyan/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-cyan">
            New
          </span>
        )}
      </div>
      <div className="text-sm leading-5 text-bone/76">{description}</div>
      {changes.length > 0 && (
        <div className="rounded-sm border border-rust/40 bg-pit/55 px-2 py-1.5">
          {/* 4-col grid so the Now/After headers sit exactly over the from/to values. */}
          <div className="grid grid-cols-[1fr_auto_0.75rem_auto] items-center gap-x-1.5 text-[11px]">
            <span className="text-[8px] font-black uppercase tracking-widest text-bone/35">
              Stat
            </span>
            <span className="text-right text-[8px] font-black uppercase tracking-widest text-bone/35">
              Now
            </span>
            <span />
            <span className="text-right text-[8px] font-black uppercase tracking-widest text-bone/35">
              After
            </span>
            {changes.map((c) => (
              <Fragment key={c.label}>
                <span className="uppercase tracking-wide text-bone/55">{c.label}</span>
                <span className="text-right font-black tabular-nums text-bone/40">{c.from}</span>
                <span className="text-center text-sun">→</span>
                <span className="text-right font-black tabular-nums text-bone/85">{c.to}</span>
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
