// Post-game run summary (T23 redesign). One rich page: the verdict, the spoils
// you banked (Glory earned, bosses slain), the run's numbers, and the build you
// actually became (final weapon, upgrades, kills by type). Spending Glory lives
// in the menu's Glory Tree — this screen is for reading your run. Restart in
// place (V15) or return to the menu.

import { useEffect } from 'react';
import { useUiStore } from '../store';
import { RunSheet } from '../RunSheet';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] uppercase tracking-widest text-dust">{label}</span>
      <span className="text-lg font-bold text-bone tabular-nums">{value}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-rust/40 bg-umber/40 p-4">
      <div className="mb-2 border-b border-rust/30 pb-1 text-[11px] tracking-[0.3em] text-gold">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function GameOverScreen() {
  const result = useUiStore((s) => s.result);
  const sheet = useUiStore((s) => s.sheet);
  const restart = useUiStore((s) => s.restartRun);
  const toMenu = useUiStore((s) => s.toMenu);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') restart();
      if (e.key === 'Escape') toMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [restart, toMenu]);

  if (!result) return null;
  const won = result.won;

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-0 overflow-y-auto bg-pit/90 py-6 font-mono">
      {/* Verdict */}
      <div className={`text-xs tracking-[0.45em] ${won ? 'text-gold' : 'text-ember'}`}>
        {won ? 'GATEKEEPER SLAIN' : 'YOU DIED'}
      </div>
      <div
        className={`mb-4 text-4xl font-black tracking-widest ${won ? 'text-gold drop-shadow-[0_0_18px_rgba(255,210,63,0.5)]' : 'text-bone'}`}
      >
        {won ? 'VICTORY' : 'RUN OVER'}
      </div>

      {/* Spoils — what you banked, up front */}
      <div className="mb-5 flex items-stretch gap-3">
        <div className="flex flex-col items-center justify-center rounded-md border-2 border-gold bg-gold/10 px-6 py-2">
          <span className="text-[10px] uppercase tracking-widest text-gold/80">Glory earned</span>
          <span className="text-3xl font-black text-gold tabular-nums">
            +{result.gloryEarned} ◆
          </span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-md border border-rust/50 bg-umber/60 px-6 py-2">
          <span className="text-[10px] uppercase tracking-widest text-dust">Bosses slain</span>
          <span className="text-3xl font-black text-bone tabular-nums">{result.bossKills}</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-md border border-rust/50 bg-umber/60 px-6 py-2">
          <span className="text-[10px] uppercase tracking-widest text-dust">Reached</span>
          <span className="text-3xl font-black text-cyan tabular-nums">Lv {result.level}</span>
        </div>
      </div>

      {/* Body: numbers + kills + the reusable build sheet */}
      <div className="flex w-[64rem] max-w-[94vw] flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Panel title="SURVIVAL">
            <Stat label="Time" value={fmtTime(result.durationSec)} />
            <Stat label="Damage taken" value={`${Math.round(result.damageTaken)}`} />
            <Stat label="Upgrades" value={`${result.upgradesTaken}`} />
          </Panel>
          <Panel title="OFFENSE">
            <Stat label="Kills" value={`${result.kills}`} />
            <Stat label="Damage" value={`${Math.round(result.damageDealt)}`} />
            <Stat label="DPS" value={result.dps.toFixed(1)} />
            <Stat label="Kills / min" value={result.killsPerMin.toFixed(1)} />
          </Panel>
          <Panel title="KILLS BY TYPE">
            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto pr-1">
              {result.killsByType.map((k) => (
                <div key={k.name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-bone/85">{k.name}</span>
                  <span className="text-ember tabular-nums">×{k.count}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        {sheet && <RunSheet sheet={sheet} compact />}
      </div>

      <div className="mt-6 flex gap-4">
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
      <div className="mt-3 text-xs text-bone/50">
        Enter to restart · Esc for menu · spend Glory in the Glory Tree
      </div>
    </div>
  );
}
