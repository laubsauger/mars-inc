// Boss-reward overlay (T43). On a boss kill the sim freezes and three MAJOR picks
// rise over the arena — the progression hinge. Mirrors the upgrade draft but
// reads as a bigger, rarer moment. Keyboard 1/2/3 also selects.

import { useEffect } from 'react';
import { useUiStore } from '../store';

const KIND_RING: Record<string, string> = {
  evolution: 'border-gold',
  system: 'border-cyan',
  mutation: 'border-elite',
  artifact: 'border-ember',
};

const KIND_LABEL: Record<string, string> = {
  evolution: 'EVOLUTION',
  system: 'SYSTEM',
  mutation: 'MUTATION',
  artifact: 'ARTIFACT',
};

export function BossRewardScreen() {
  const boss = useUiStore((s) => s.bossReward);
  const choose = useUiStore((s) => s.chooseBossReward);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= boss.options.length) choose(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boss.options.length, choose]);

  if (!boss.open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-pit/85 font-mono">
      <div className="mb-1 text-xs tracking-[0.5em] text-gold">GATEKEEPER FELLED</div>
      <div className="mb-8 text-2xl font-black tracking-widest text-bone">CLAIM YOUR SPOILS</div>
      <div className="flex gap-4">
        {boss.options.map((o, i) => (
          <button
            key={o.id}
            onClick={() => choose(i)}
            className={`group flex w-64 flex-col gap-3 rounded-md border-2 ${
              KIND_RING[o.kind] ?? 'border-bone/40'
            } bg-umber/90 p-5 text-left transition hover:-translate-y-1 hover:border-gold focus:border-gold focus:outline-none`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-dust">
                {KIND_LABEL[o.kind] ?? o.kind}
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded border border-bone/30 text-xs text-bone/70">
                {i + 1}
              </span>
            </div>
            <div className="text-lg font-bold text-bone">{o.name}</div>
            <div className="text-sm text-bone/70">{o.description}</div>
          </button>
        ))}
      </div>
      <div className="mt-6 text-xs text-bone/50">
        the run continues — harder. click or press 1–3
      </div>
    </div>
  );
}
