import { useState } from 'react';
import { useUiStore } from '../../store';
import { ControlsReference } from '../../controls-reference';
import { Panel, SettingRow, Slider, Toggle } from './shared';

// Reusable settings rows — shared by the menu Settings panel and the in-game
// pause menu so both edit the same persisted slice via `applySetting`.
export function SettingsControls() {
  const s = useUiStore((st) => st.settings);
  const set = useUiStore((st) => st.applySetting);
  return (
    <div className="rounded-md border border-rust/70 bg-umber/80 px-6 py-3">
      <SettingRow label="MASTER VOLUME">
        <Slider value={s.masterVolume} onChange={(v) => set({ masterVolume: v })} />
      </SettingRow>
      <SettingRow label="SFX VOLUME">
        <Slider value={s.sfxVolume} onChange={(v) => set({ sfxVolume: v })} />
      </SettingRow>
      <SettingRow label="MUSIC VOLUME">
        <Slider value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} />
      </SettingRow>
      <SettingRow label="MUSIC DURING COMBAT">
        <Toggle on={s.musicInCombat} onChange={(v) => set({ musicInCombat: v })} />
      </SettingRow>
      <SettingRow label="SCREEN SHAKE">
        <Slider value={s.screenShake} onChange={(v) => set({ screenShake: v })} />
      </SettingRow>
      <SettingRow label="UI SCALE">
        <Slider
          value={s.uiScale}
          onChange={(v) => set({ uiScale: v })}
          min={0.8}
          max={1.4}
          step={0.1}
        />
      </SettingRow>
      <SettingRow label="ENEMY HEALTH BARS">
        <Toggle on={s.enemyHealthbars} onChange={(v) => set({ enemyHealthbars: v })} />
      </SettingRow>
      <SettingRow label="GRENADE RANGE MARKER">
        <Toggle on={s.showGrenadeRange} onChange={(v) => set({ showGrenadeRange: v })} />
      </SettingRow>
      <SettingRow label="PROJECTILE LIGHTING">
        <Toggle on={s.projectileLighting} onChange={(v) => set({ projectileLighting: v })} />
      </SettingRow>
      <SettingRow label="TOON / INK SHADING">
        <Toggle on={s.toonShading} onChange={(v) => set({ toonShading: v })} />
      </SettingRow>
      <SettingRow label="AMBIENT OCCLUSION">
        <Toggle on={s.ambientOcclusion} onChange={(v) => set({ ambientOcclusion: v })} />
      </SettingRow>
      <SettingRow label="REDUCE FLASH">
        <Toggle on={s.reduceFlash} onChange={(v) => set({ reduceFlash: v })} />
      </SettingRow>
      <SettingRow label="HOLD TO SPRINT">
        <Toggle on={s.holdToSprint} onChange={(v) => set({ holdToSprint: v })} />
      </SettingRow>
      <SettingRow label="AUTO-PAUSE ON FOCUS LOSS">
        <Toggle on={s.pauseOnFocusLoss} onChange={(v) => set({ pauseOnFocusLoss: v })} />
      </SettingRow>
      <SettingRow label="PRE-COMBAT COUNTDOWN">
        <Toggle on={s.showCountdown} onChange={(v) => set({ showCountdown: v })} />
      </SettingRow>
      <SettingRow label="ORBIT / ZOOM CAMERA">
        <Toggle on={s.cameraControls} onChange={(v) => set({ cameraControls: v })} />
      </SettingRow>
    </div>
  );
}

// Tabbed settings body (Options / Controls) — the SHARED surface for both the menu
// Settings panel and the in-game pause menu. `footer` renders inside the Options tab
// below the form (the menu passes its danger-zone Reset there; the pause menu omits it).
export function SettingsTabs({ footer }: { footer?: React.ReactNode }) {
  const [tab, setTab] = useState<'options' | 'controls'>('options');
  return (
    <>
      <div className="mb-4 flex gap-2">
        {(['options', 'controls'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-sm border px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition focus:outline-none ${
              tab === t
                ? 'border-gold bg-gold/15 text-gold'
                : 'border-rust bg-pit/60 text-bone/55 hover:border-gold hover:text-gold'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'controls' ? (
        <>
          <ControlsReference />
          <div className="mt-3 text-xs text-bone/40">
            Key rebinding and controller support land in a later pass.
          </div>
        </>
      ) : (
        <>
          <SettingsControls />
          <div className="mt-3 text-xs text-bone/40">
            Key rebinding, controller, and colorblind palettes land in a later pass.
          </div>
          {footer}
        </>
      )}
    </>
  );
}

/** Danger zone — wipes the entire save (menu Settings only, never in-run pause). */
function ResetProgressSection() {
  const resetProgress = useUiStore((s) => s.resetProgress);
  const [confirmWipe, setConfirmWipe] = useState(false);
  return (
    <div className="mt-4 rounded-md border border-bleed/50 bg-pit/50 px-6 py-4">
      <div className="text-sm font-bold tracking-wide text-bleed">RESET PROGRESS</div>
      <p className="mt-1 text-xs leading-relaxed text-bone/55">
        Permanently erases ALL saved data — Martian Glory, the Glory Tree, unlocks, records, run
        history, and settings. This cannot be undone. The page reloads into a fresh save.
      </p>
      <button
        onClick={() => {
          if (confirmWipe) resetProgress();
          else setConfirmWipe(true);
        }}
        onBlur={() => setConfirmWipe(false)}
        title="Erase all saved progress and start over"
        className={`mt-3 rounded-sm border px-4 py-1.5 text-sm font-bold transition focus:outline-none ${
          confirmWipe
            ? 'border-bleed bg-bleed/25 text-bleed'
            : 'border-bleed/70 bg-umber/80 text-bone/80 hover:border-bleed hover:text-bleed'
        }`}
      >
        {confirmWipe ? 'CONFIRM · ERASE EVERYTHING' : 'RESET ALL PROGRESS'}
      </button>
    </div>
  );
}

export function SettingsPanel() {
  return (
    <Panel title="SETTINGS">
      <SettingsTabs footer={<ResetProgressSection />} />
    </Panel>
  );
}
