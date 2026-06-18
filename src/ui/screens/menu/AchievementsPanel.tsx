// Achievements browser (T-ach) — the Challenges menu entry. Grouped by tier
// (Standard / Mastery / Oddities). LEVELED achievements show stage pips + the next
// threshold; one-shots show a simple earned tick. Hidden ones mask as "???" until
// earned. Reads the earned-STAGE map off the profile slice.

import { useUiStore } from '../../store';
import { Panel } from './shared';
import {
  ACHIEVEMENTS,
  maxStage,
  stageDesc,
  type Achievement,
  type AchTier,
} from '../../../content/achievements';

const GROUPS: { tier: AchTier; label: string; accent: string; ring: string; pip: string }[] = [
  {
    tier: 'expected',
    label: 'Standard',
    accent: 'text-cyan',
    ring: 'border-cyan/60',
    pip: 'bg-cyan',
  },
  { tier: 'hard', label: 'Mastery', accent: 'text-gold', ring: 'border-gold/70', pip: 'bg-gold' },
  {
    tier: 'weird',
    label: 'Oddities',
    accent: 'text-elite',
    ring: 'border-elite/70',
    pip: 'bg-elite',
  },
];

function Card({ a, stage }: { a: Achievement; stage: number }) {
  const max = maxStage(a);
  const leveled = !!a.thresholds;
  const unlocked = stage > 0;
  const masked = !!a.hidden && !unlocked;
  const accent = GROUPS.find((g) => g.tier === a.tier)!;
  // Next goal for a partially-completed leveled achievement.
  const next = leveled && stage < max ? a.thresholds![stage] : null;
  return (
    <div
      className={`flex items-start gap-3 rounded-sm border p-3 transition ${
        unlocked
          ? `${accent.ring} bg-umber/80 shadow-[inset_0_0_0_1px_rgba(7,5,4,0.7)]`
          : 'border-rust/40 bg-pit/50 opacity-70'
      }`}
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-sm border text-2xl ${
          unlocked
            ? `${accent.ring} ${accent.accent} drop-shadow-[0_0_6px_currentColor]`
            : 'border-rust/40 text-bone/30'
        }`}
      >
        {masked ? '?' : a.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-black ${unlocked ? 'text-bone' : 'text-bone/55'}`}>
            {masked ? '???' : a.name}
          </span>
          {leveled ? (
            <span className={`shrink-0 text-[10px] font-black tabular-nums ${accent.accent}`}>
              {stage}
              <span className="text-bone/35">/{max}</span>
            </span>
          ) : (
            unlocked && (
              <span
                className={`shrink-0 text-[9px] font-black uppercase tracking-widest ${accent.accent}`}
              >
                ✓ Earned
              </span>
            )
          )}
        </div>
        <div className="mt-0.5 text-xs leading-snug text-bone/65">
          {masked
            ? 'A sealed contract — earn it to reveal.'
            : unlocked
              ? leveled
                ? stageDesc(a, stage)
                : a.desc
              : a.hint}
        </div>
        {/* Leveled progress: stage pips + the next threshold to chase. */}
        {leveled && !masked && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: max }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-5 rounded-full ${i < stage ? accent.pip : 'bg-rust/40'}`}
                />
              ))}
            </div>
            {next != null && (
              <span className="text-[10px] tabular-nums text-bone/45">
                next: {next.toLocaleString()} {a.unit}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AchievementsPanel() {
  const earned = useUiStore((s) => s.profile.achievements);
  // Progress is measured in STAGES (leveled cards count for their thresholds).
  const totalStages = ACHIEVEMENTS.reduce((s, a) => s + maxStage(a), 0);
  const gotStages = ACHIEVEMENTS.reduce((s, a) => s + Math.min(maxStage(a), earned[a.id] ?? 0), 0);
  return (
    <Panel title="Achievements">
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="text-xs text-bone/60">
          Earn these in the Pit — they pop live and bank to your record.
        </span>
        <span className="shrink-0 font-mono text-sm font-black text-gold tabular-nums">
          {gotStages}
          <span className="text-bone/40">/{totalStages}</span>
        </span>
      </div>
      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-sm bg-pit/70">
        <div
          className="h-full bg-gold transition-[width] duration-300"
          style={{ width: `${(gotStages / Math.max(1, totalStages)) * 100}%` }}
        />
      </div>
      <div className="flex flex-col gap-5">
        {GROUPS.map((g) => {
          const list = ACHIEVEMENTS.filter((a) => a.tier === g.tier);
          const gTotal = list.reduce((s, a) => s + maxStage(a), 0);
          const gGot = list.reduce((s, a) => s + Math.min(maxStage(a), earned[a.id] ?? 0), 0);
          return (
            <section key={g.tier}>
              <div className="mb-2 flex items-center gap-2 border-b border-rust/40 pb-1">
                <span className={`text-[11px] font-black uppercase tracking-[0.3em] ${g.accent}`}>
                  {g.label}
                </span>
                <span className="text-[10px] tabular-nums text-bone/45">
                  {gGot}/{gTotal}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {list.map((a) => (
                  <Card key={a.id} a={a} stage={earned[a.id] ?? 0} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
