// Achievements browser (T-ach) — the Challenges menu entry. Grouped by tier
// (Standard / Mastery / Oddities), unlocked ones lit, locked ones dimmed, and HIDDEN
// ones masked as "???" until earned. Reads the earned-set off the profile slice.

import { useUiStore } from '../../store';
import { Panel } from './shared';
import { ACHIEVEMENTS, type Achievement, type AchTier } from '../../../content/achievements';

const GROUPS: { tier: AchTier; label: string; accent: string; ring: string }[] = [
  { tier: 'expected', label: 'Standard', accent: 'text-cyan', ring: 'border-cyan/60' },
  { tier: 'hard', label: 'Mastery', accent: 'text-gold', ring: 'border-gold/70' },
  { tier: 'weird', label: 'Oddities', accent: 'text-elite', ring: 'border-elite/70' },
];

function Card({ a, unlocked }: { a: Achievement; unlocked: boolean }) {
  const masked = !!a.hidden && !unlocked;
  const accent = GROUPS.find((g) => g.tier === a.tier)!;
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
          {unlocked && (
            <span
              className={`shrink-0 text-[9px] font-black uppercase tracking-widest ${accent.accent}`}
            >
              ✓ Earned
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs leading-snug text-bone/65">
          {unlocked ? a.desc : masked ? 'A sealed contract — earn it to reveal.' : a.hint}
        </div>
      </div>
    </div>
  );
}

export function AchievementsPanel() {
  const earned = useUiStore((s) => s.profile.achievements);
  const total = ACHIEVEMENTS.length;
  const got = ACHIEVEMENTS.filter((a) => earned[a.id]).length;
  return (
    <Panel title="Achievements">
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="text-xs text-bone/60">
          Earn these in the Pit — they pop live and bank to your record.
        </span>
        <span className="shrink-0 font-mono text-sm font-black text-gold tabular-nums">
          {got}
          <span className="text-bone/40">/{total}</span>
        </span>
      </div>
      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-sm bg-pit/70">
        <div
          className="h-full bg-gold transition-[width] duration-300"
          style={{ width: `${(got / Math.max(1, total)) * 100}%` }}
        />
      </div>
      <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
        {GROUPS.map((g) => {
          const list = ACHIEVEMENTS.filter((a) => a.tier === g.tier);
          const gGot = list.filter((a) => earned[a.id]).length;
          return (
            <section key={g.tier}>
              <div className="mb-2 flex items-center gap-2 border-b border-rust/40 pb-1">
                <span className={`text-[11px] font-black uppercase tracking-[0.3em] ${g.accent}`}>
                  {g.label}
                </span>
                <span className="text-[10px] tabular-nums text-bone/45">
                  {gGot}/{list.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {list.map((a) => (
                  <Card key={a.id} a={a} unlocked={!!earned[a.id]} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
