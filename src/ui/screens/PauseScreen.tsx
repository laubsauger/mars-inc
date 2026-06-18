// Pause overlay (T43). Freezing the run is also when you study your build, so the
// pause menu shows the reusable character sheet (attributes + abilities) plus the
// controls row: Resume, Settings (reachable here, not just the main menu), and
// Quit. The sim is already frozen while `paused`; this is pure presentation (V2).

import { useEffect, useState } from 'react';
import { useUiStore } from '../store';
import { RunSheet } from '../RunSheet';
import { SettingsTabs } from './MainMenu';
import { SocialFooter } from '../SocialFooter';

export function PauseScreen() {
  const paused = useUiStore((s) => s.hud.paused);
  const sheet = useUiStore((s) => s.sheet);
  const togglePause = useUiStore((s) => s.togglePause);
  const surrenderRun = useUiStore((s) => s.surrenderRun);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  useEffect(() => {
    if (!paused) {
      setShowSettings(false);
      setConfirmSurrender(false);
    }
  }, [paused]);
  if (!paused) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-pit/85 font-mono">
      <div className="mb-1 text-xs tracking-[0.5em] text-ember">CONTRACT SUSPENDED</div>
      <div className="mb-6 text-4xl font-black tracking-widest text-bone">PAUSED</div>

      {showSettings ? (
        <div className="w-[40rem] max-w-[92vw]">
          <SettingsTabs />
          <button
            onClick={() => setShowSettings(false)}
            className="mt-3 w-full rounded-sm border border-rust bg-umber/80 px-4 py-2 text-sm font-bold tracking-widest text-bone transition hover:border-gold hover:bg-iron/70 focus:outline-none"
          >
            ← BACK
          </button>
        </div>
      ) : (
        <>
          {sheet && (
            <div className="w-[52rem] max-w-[92vw]">
              <div className="mb-2 text-center text-sm tracking-widest text-cyan">
                LEVEL {sheet.level}
              </div>
              <RunSheet sheet={sheet} />
            </div>
          )}
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={togglePause}
              className="rounded-sm border-2 border-gold bg-gold/15 px-6 py-2.5 text-sm font-black tracking-widest text-bone transition hover:bg-gold/25 focus:outline-none"
            >
              RESUME
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-sm border border-rust bg-umber/80 px-6 py-2.5 text-sm font-bold tracking-widest text-bone transition hover:border-gold hover:bg-iron/70 focus:outline-none"
            >
              SETTINGS
            </button>
            {confirmSurrender ? (
              <button
                onClick={surrenderRun}
                className="rounded-sm border-2 border-bleed bg-bleed/20 px-6 py-2.5 text-sm font-black tracking-widest text-bleed transition hover:bg-bleed/30 focus:outline-none"
              >
                CONFIRM — END RUN
              </button>
            ) : (
              <button
                onClick={() => setConfirmSurrender(true)}
                className="rounded-sm border border-rust bg-umber/80 px-6 py-2.5 text-sm font-bold tracking-widest text-bone transition hover:border-bleed hover:text-bleed focus:outline-none"
              >
                SURRENDER
              </button>
            )}
          </div>
          <div className="mt-4 text-xs text-bone/50">
            {confirmSurrender
              ? 'Surrender keeps all Glory & unlocks earned so far — like a normal death. Esc to resume.'
              : 'Esc to resume'}
          </div>
        </>
      )}
      <SocialFooter className="fixed bottom-3 left-6 z-20 short:bottom-1" />
    </div>
  );
}
