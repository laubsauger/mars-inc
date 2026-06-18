// Post-game run summary (T23 redesign). One rich page: the verdict, the spoils
// you banked (Glory earned, bosses slain), the run's numbers, and the build you
// actually became (final weapon, upgrades, kills by type). Spending Glory lives
// in the menu's Glory Tree — this screen is for reading your run. Restart in
// place (V15) or return to the menu.

import { useEffect, useState } from 'react';
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
  // "Peek" hides the whole summary so the frozen aftermath (the scene is still rendered
  // behind this overlay) can be surveyed; a back button restores the results.
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (peek)
          setPeek(false); // Esc first backs out of the peek, then exits
        else toMenu();
        return;
      }
      if (peek) return; // while surveying, swallow the run-end hotkeys
      if (e.key === 'Enter') restart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [restart, toMenu, peek]);

  if (!result) return null;
  const won = result.won;

  // Aftermath survey: drop the overlay (the run is frozen, scene still drawn) and float
  // a single button to return. pointer-events only on the button so the pit shows through.
  if (peek) {
    return (
      <div className="pointer-events-none absolute inset-0 font-mono">
        <button
          onClick={() => setPeek(false)}
          className="pointer-events-auto fixed left-1/2 top-5 -translate-x-1/2 rounded-md border-2 border-gold bg-pit/85 px-6 py-2.5 text-sm font-bold tracking-widest text-gold shadow-[0_8px_28px_rgba(0,0,0,0.55)] backdrop-blur-sm transition hover:bg-gold/15 focus:outline-none"
        >
          ← BACK TO RESULTS
        </button>
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.3em] text-bone/45">
          Surveying the aftermath · the contract is closed
        </div>
      </div>
    );
  }

  return (
    // Viewport-locked column: verdict + spoils header and the action footer are
    // PINNED (shrink-0); only the middle body scrolls when it's taller than the
    // space left. Restart/Menu can never be pushed off-screen (the old single
    // scroll box buried them below the fold on short viewports / long builds).
    <div className="pointer-events-auto absolute inset-0 flex flex-col bg-pit/90 font-mono">
      {/* Header — verdict + spoils, always visible */}
      <div className="flex shrink-0 flex-col items-center px-4 pb-3 pt-5">
        <div className={`text-xs tracking-[0.45em] ${won ? 'text-gold' : 'text-ember'}`}>
          {won ? 'GATEKEEPER SLAIN' : 'YOU DIED'}
        </div>
        <div
          className={`mb-3 text-4xl font-black tracking-widest ${won ? 'text-gold drop-shadow-[0_0_18px_rgba(255,210,63,0.5)]' : 'text-bone'}`}
        >
          {won ? 'VICTORY' : 'RUN OVER'}
        </div>
        <div className="flex items-stretch gap-3">
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
      </div>

      {/* Body — the ONLY scroller; flex-1 + min-h-0 so it absorbs the overflow */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="mx-auto flex w-[64rem] max-w-[94vw] flex-col gap-3 py-1">
          {result.fatalBlow && (
            <div className="flex items-center gap-4 rounded-md border border-bleed/50 bg-bleed/10 px-5 py-3 shadow-[inset_0_0_0_1px_rgba(7,5,4,0.6)]">
              <span className="text-3xl text-bleed drop-shadow-[0_0_8px_rgba(255,59,48,0.5)]">
                ☠
              </span>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.3em] text-bleed/80">
                  Cause of death
                </div>
                <div className="truncate text-lg font-black text-bone">
                  {result.fatalBlow.unit}
                  <span className="px-2 text-bone/40">·</span>
                  <span className="text-bone/85">{result.fatalBlow.attack}</span>
                </div>
              </div>
              <div className="ml-auto shrink-0 text-right">
                <div className="text-[10px] uppercase tracking-widest text-dust">Killing blow</div>
                <div className="text-2xl font-black text-bleed tabular-nums">
                  −{result.fatalBlow.damage}
                </div>
              </div>
            </div>
          )}
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
      </div>

      {/* Footer — actions, always visible */}
      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-rust/20 px-4 pb-4 pt-3">
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
          <button
            onClick={() => setPeek(true)}
            title="Hide this summary and survey the frozen aftermath"
            className="rounded-md border-2 border-rust/70 bg-pit/60 px-6 py-3 text-lg font-bold tracking-widest text-bone/80 transition hover:-translate-y-0.5 hover:border-cyan hover:text-cyan focus:outline-none"
          >
            VIEW THE PIT
          </button>
        </div>
        <div className="text-xs text-bone/50">
          Enter to restart · Esc for menu · View the Pit to survey the aftermath
        </div>
      </div>
    </div>
  );
}
