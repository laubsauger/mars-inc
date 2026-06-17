// End-of-act conclusion (T75/T50, V36). After the act's FINAL boss falls and its
// reward is claimed, the sim freezes on this two-choice prompt: EXTRACT (bank the
// victory, run over → game-over summary) or OVERRUN (opt into the endless gauntlet
// — the infinite "gimmick"). The finite extract is the intended default path.

import { useEffect } from 'react';
import { useUiStore } from '../store';

export function ConclusionScreen() {
  const conclusion = useUiStore((s) => s.conclusion);
  const choose = useUiStore((s) => s.chooseConclusion);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === '1') choose(true);
      else if (e.key === '2') choose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose]);

  if (!conclusion.open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-pit/90 font-mono">
      <div className="mb-1 text-xs tracking-[0.5em] text-gold">ACT CLEARED</div>
      <div className="mb-2 text-4xl font-black tracking-widest text-gold drop-shadow-[0_0_18px_rgba(240,200,121,0.5)]">
        FINAL BOSS DOWN
      </div>
      <div className="mb-8 max-w-md text-center text-sm text-bone/60">
        The act is yours. Boss kills + unlocks are already secured. Extract for the victory bonus —
        or stay in the pit and let the Overrun gauntlet come for everything else.
      </div>
      <div className="flex gap-4">
        <button
          onClick={() => choose(true)}
          className="group flex w-72 flex-col gap-2 rounded-md border-2 border-gold bg-gold/10 p-6 text-left transition hover:-translate-y-1 hover:border-gold focus:border-gold focus:outline-none"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-gold/80">Recommended</span>
            <span className="flex h-6 w-6 items-center justify-center rounded border border-bone/30 text-xs text-bone/70">
              1
            </span>
          </div>
          <div className="text-xl font-black text-gold">EXTRACT</div>
          <div className="text-sm text-bone/70">
            Win the run. Bank all Glory + unlocks, see the spoils. (Enter)
          </div>
        </button>
        <button
          onClick={() => choose(false)}
          className="group flex w-72 flex-col gap-2 rounded-md border-2 border-ember/70 bg-umber/90 p-6 text-left transition hover:-translate-y-1 hover:border-ember focus:border-ember focus:outline-none"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-ember/80">Endless</span>
            <span className="flex h-6 w-6 items-center justify-center rounded border border-bone/30 text-xs text-bone/70">
              2
            </span>
          </div>
          <div className="text-xl font-black text-ember">OVERRUN</div>
          <div className="text-sm text-bone/70">
            Keep playing — bosses recur, harder, forever. Your unlocks are already safe. (2)
          </div>
        </button>
      </div>
    </div>
  );
}
