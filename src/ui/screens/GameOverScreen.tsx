// Post-game stats page + restart (T22/T23, V20). Renders the run summary
// computed from authoritative sim stats, grouped into readable sections, and
// restarts the run in place — no page reload (V15). Full menu lands at T27.

import { useEffect } from 'react';
import { useUiStore } from '../store';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-dust">{label}</span>
      <span className="font-mono text-2xl font-bold text-bone tabular-nums">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="border-b border-rust/40 pb-1 font-mono text-xs tracking-[0.3em] text-gold">
        {title}
      </div>
      <div className="flex gap-10">{children}</div>
    </div>
  );
}

function GloryPanel() {
  const meta = useUiStore((s) => s.meta);
  const buy = useUiStore((s) => s.buyPermanent);
  return (
    <div className="mb-8 w-[36rem] max-w-[90vw]">
      <div className="mb-3 flex items-center justify-between border-b border-rust/40 pb-1">
        <span className="font-mono text-xs tracking-[0.3em] text-gold">MARTIAN GLORY</span>
        <span className="font-mono text-sm text-bone">
          {meta.lastEarned > 0 && <span className="text-cyan">+{meta.lastEarned} </span>}
          <span className="text-bone/60">balance</span> {meta.glory}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {meta.permanents.map((p) => {
          const maxed = p.owned >= p.maxLevel;
          return (
            <button
              key={p.id}
              disabled={!p.affordable}
              onClick={() => buy(p.id)}
              className="flex items-center justify-between rounded border border-rust/50 bg-umber/80 px-3 py-2 text-left transition enabled:hover:border-gold disabled:opacity-50"
            >
              <span>
                <span className="font-mono text-sm text-bone">{p.name}</span>{' '}
                <span className="font-mono text-[10px] text-dust">
                  {p.owned}/{p.maxLevel}
                </span>
                <div className="font-mono text-xs text-bone/60">{p.description}</div>
              </span>
              <span className="ml-3 shrink-0 font-mono text-sm text-gold">
                {maxed ? 'MAX' : `${p.cost} ◆`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function GameOverScreen() {
  const result = useUiStore((s) => s.result);
  const restart = useUiStore((s) => s.restartRun);
  const toMenu = useUiStore((s) => s.toMenu);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') restart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [restart]);

  if (!result) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-pit/85 font-mono">
      <div className="mb-1 text-sm tracking-[0.4em] text-ember">YOU DIED</div>
      <div className="mb-8 text-4xl font-bold tracking-widest text-bone">RUN OVER</div>

      <div className="mb-10 flex flex-col gap-7">
        <Section title="SURVIVAL">
          <Stat label="Time" value={fmtTime(result.durationSec)} />
          <Stat label="Level" value={`${result.level}`} />
          <Stat label="Upgrades" value={`${result.upgradesTaken}`} />
        </Section>
        <Section title="OFFENSE">
          <Stat label="Kills" value={`${result.kills}`} />
          <Stat label="Damage" value={`${Math.round(result.damageDealt)}`} />
          <Stat label="DPS" value={result.dps.toFixed(1)} />
          <Stat label="Kills/min" value={result.killsPerMin.toFixed(1)} />
        </Section>
        <Section title="DEFENSE">
          <Stat label="Damage taken" value={`${Math.round(result.damageTaken)}`} />
        </Section>
      </div>

      <GloryPanel />

      <div className="flex gap-4">
        <button
          onClick={restart}
          className="rounded-md border-2 border-gold bg-ember/20 px-8 py-3 text-lg font-bold tracking-widest text-bone transition hover:-translate-y-0.5 hover:bg-ember/30 focus:outline-none"
        >
          RESTART
        </button>
        <button
          onClick={toMenu}
          className="rounded-md border-2 border-rust bg-umber/90 px-8 py-3 text-lg font-bold tracking-widest text-bone transition hover:-translate-y-0.5 hover:border-gold focus:outline-none"
        >
          MENU
        </button>
      </div>
      <div className="mt-4 text-xs text-bone/50">Enter to restart</div>
    </div>
  );
}
