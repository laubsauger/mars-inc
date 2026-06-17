// First-run controls briefing (start gate). Split from Hud.tsx; reuses the shared
// ControlsReference table.
import { useState } from 'react';
import { useUiStore } from '../store';
import { ControlsReference } from '../controls-reference';

export function ControlsHint() {
  const screen = useUiStore((s) => s.screen);
  const startCombat = useUiStore((s) => s.startCombat);
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem('mars:controls-seen') === '1';
    } catch {
      return false;
    }
  });
  const [dontShow, setDontShow] = useState(false);
  if (seen || screen !== 'arena') return null;
  const dismiss = () => {
    setSeen(true); // hide for THIS session regardless
    if (dontShow) {
      try {
        localStorage.setItem('mars:controls-seen', '1'); // persist only on opt-out
      } catch {
        /* ignore */
      }
    }
    startCombat(); // begin the countdown + spawns now
  };
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[22%] w-80 -translate-x-1/2 border-2 border-gold/70 bg-pit/92 p-4 font-mono shadow-[0_18px_60px_rgba(0,0,0,0.72),inset_0_0_0_1px_rgba(240,200,121,0.12)]">
      <div className="mb-0.5 text-center text-[10px] uppercase tracking-widest text-dust">
        Mars Inc field briefing
      </div>
      <div className="mb-2.5 text-center text-sm font-black uppercase tracking-widest text-gold">
        Controls
      </div>
      <ControlsReference only={['Combat']} />
      <div className="mt-2 text-center text-[10px] leading-relaxed text-bone/45">
        Full list lives in <span className="text-bone/70">Settings → Controls</span>.
      </div>
      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-[11px] text-bone/65">
        <input
          type="checkbox"
          checked={dontShow}
          onChange={(e) => setDontShow(e.target.checked)}
          className="h-3.5 w-3.5 accent-gold"
        />
        Don&apos;t show this again
      </label>
      <button
        onClick={dismiss}
        className="mt-3 w-full rounded-sm border border-gold/60 bg-gold/12 py-1.5 text-xs font-black uppercase tracking-widest text-gold transition hover:bg-gold/20 focus:outline-none"
      >
        Got it
      </button>
    </div>
  );
}
