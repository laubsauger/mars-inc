// Combat HUD (§13.2 minimal). Each widget subscribes to its own store slice so
// a health change never re-renders the sprint widget, and vice versa.

import { useEffect, useState } from 'react';
import { useUiStore, type AnnounceState } from './store';
import { HotBar } from './hud/HotBar';
import { InspectPanel } from './hud/InspectPanel';
import { ControlsHint } from './hud/ControlsHint';

// Shared "juice" backdrop — a warm ember-tinted radial that's saturated in the
// core and falls off softly to nothing (no hard disc/border). Reused by the boss
// banner and the countdown so big centred text always reads with character.
const JUICE_BACKDROP =
  'radial-gradient(ellipse at center, rgba(30,9,4,0.96) 0%, rgba(128,44,16,0.52) 28%, rgba(64,20,8,0.24) 54%, rgba(7,5,4,0) 80%)';

function HealthBar() {
  const health = useUiStore((s) => s.hud.health);
  const max = useUiStore((s) => s.hud.maxHealth);
  const pct = Math.max(0, Math.min(1, health / max)) * 100;
  return (
    <div className="absolute bottom-6 left-6 w-64">
      <div className="mb-1 font-mono text-xs text-bone/70">HEALTH</div>
      <div className="h-3 w-full overflow-hidden rounded-sm border border-rust bg-pit/70">
        <div
          className="h-full bg-ember transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ShieldPips() {
  const charges = useUiStore((s) => s.hud.shieldCharges);
  const max = useUiStore((s) => s.hud.shieldMax);
  if (max <= 0) return null; // hidden until a shield upgrade is taken
  return (
    <div className="absolute bottom-[3.9rem] left-6 flex items-center gap-1.5">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-cyan/70">
        Shield
      </span>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`h-3 w-3 rotate-45 border ${
            i < charges
              ? 'border-cyan bg-cyan/70 shadow-[0_0_10px_rgba(50,215,255,0.6)]'
              : 'border-cyan/40 bg-pit/60'
          }`}
        />
      ))}
    </div>
  );
}

/** One ARPG hotbar slot: icon + keybind, with a clockwise radial cooldown sweep
 *  that clears as `progress` (0..1) fills; a ready glow at 1. */
function BossCountdown() {
  const eta = useUiStore((s) => s.hud.bossEta);
  const countdown = useUiStore((s) => s.hud.countdown);
  if (eta == null || countdown > 0) return null;
  const urgent = eta <= 15;
  const m = Math.floor(eta / 60);
  const sec = Math.floor(eta % 60);
  const label = eta <= 0 ? 'INBOUND' : `${m}:${sec.toString().padStart(2, '0')}`;
  return (
    <div
      className={`flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-xs tracking-widest transition-colors ${
        urgent
          ? 'animate-pulse border-bleed/70 bg-bleed/15 text-bleed shadow-[0_0_14px_rgba(255,59,48,0.3)]'
          : 'border-ember/50 bg-pit/60 text-ember/90'
      }`}
      title="Time until the next Warden arrives"
    >
      <span className="text-[0.7rem] leading-none">⚠</span>
      <span className="text-[0.6rem] font-black uppercase opacity-70">Warden</span>
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

function Timer() {
  const elapsed = useUiStore((s) => s.hud.elapsed);
  const wave = useUiStore((s) => s.hud.wave);
  const m = Math.floor(elapsed / 60);
  const sec = Math.floor(elapsed % 60);
  return (
    <div className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-3 font-mono">
      {wave > 0 ? (
        <span className="rounded-sm border border-rust/70 bg-pit/60 px-2 py-0.5 text-[11px] uppercase tracking-widest text-dust">
          Wave <span className="font-black tabular-nums text-bone/90">{wave}</span>
        </span>
      ) : null}
      <span className="text-lg tracking-widest text-bone/90">
        {m}:{sec.toString().padStart(2, '0')}
      </span>
      <BossCountdown />
    </div>
  );
}

function LevelXp() {
  const level = useUiStore((s) => s.hud.level);
  const xp01 = useUiStore((s) => s.hud.xp01);
  return (
    <div className="absolute top-12 left-1/2 w-80 -translate-x-1/2">
      <div className="mb-1 text-center font-mono text-xs tracking-widest text-cyan">
        LVL {level}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-pit/70">
        <div
          className="h-full bg-cyan transition-[width] duration-150"
          style={{ width: `${Math.max(0, Math.min(1, xp01)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function EnemyCounter() {
  const enemiesAlive = useUiStore((s) => s.hud.enemiesAlive);
  const runGlory = useUiStore((s) => s.hud.runGlory);
  return (
    <div className="absolute top-5 right-6 min-w-28 border border-rust/80 bg-pit/72 px-3 py-2 text-right font-mono shadow-[0_12px_34px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(240,200,121,0.08)]">
      <div className="text-[10px] uppercase text-dust">Hostiles</div>
      <div className="text-2xl font-black leading-none text-gold tabular-nums">{enemiesAlive}</div>
      <div
        className="mt-1.5 flex items-center justify-end gap-1 border-t border-rust/40 pt-1 text-[11px] tabular-nums text-gold/90"
        title="Martian Glory earned this run so far (banked when the run ends)"
      >
        <span className="text-[9px] uppercase tracking-wide text-dust">Glory</span>
        <span className="font-bold">+{runGlory.toLocaleString()}</span>
        <span className="text-gold/70">◆</span>
      </div>
    </div>
  );
}

function Announce() {
  const announce = useUiStore((s) => s.announce);
  const [shown, setShown] = useState<AnnounceState | null>(null);

  useEffect(() => {
    if (!announce) return;
    setShown(announce);
    // Bosses linger longest; waves/evolutions medium; enemy toasts shortest.
    const ms =
      announce.kind === 'boss' || announce.kind === 'miniboss'
        ? 3200
        : announce.kind === 'unlock'
          ? 2800
          : announce.kind === 'wave' || announce.kind === 'evolution'
            ? 2200
            : 1900;
    const t = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(t);
    // Re-fire whenever a new event id arrives.
  }, [announce?.id, announce]);

  if (!shown) return null;

  // FINAL / MINIBOSS — big centered warning. The kind (not a live slice) decides the
  // tier label so it can never read "FINAL BOSS" over a themed wave again.
  if (shown.kind === 'boss' || shown.kind === 'miniboss') {
    const isFinal = shown.kind === 'boss';
    return (
      <div
        className={`pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 text-center font-mono ${
          isFinal ? 'px-24 py-10' : 'px-20 py-8'
        }`}
        style={{ background: JUICE_BACKDROP }}
      >
        <div
          className={`tracking-[0.5em] [text-shadow:0_2px_8px_rgba(0,0,0,0.95)] ${
            isFinal ? 'text-sm text-gold' : 'text-xs text-ember'
          }`}
        >
          {isFinal ? '☠ FINAL BOSS ☠' : '⚠ MINIBOSS INBOUND ⚠'}
        </div>
        <div
          className={`mt-1 font-black uppercase tracking-widest text-gold ${
            isFinal
              ? 'text-5xl [text-shadow:0_4px_16px_rgba(0,0,0,0.95),0_0_34px_rgba(255,210,63,0.65)]'
              : 'text-3xl [text-shadow:0_3px_12px_rgba(0,0,0,0.95),0_0_22px_rgba(255,210,63,0.45)]'
          }`}
        >
          {shown.text}
        </div>
        {isFinal && (
          <div className="mt-2 text-[11px] uppercase tracking-[0.4em] text-ember/90 [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
            Act finale
          </div>
        )}
      </div>
    );
  }

  // EVOLUTION — a gold/cyan upgrade flourish (its own read, not a threat).
  if (shown.kind === 'evolution') {
    return (
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 px-16 py-6 text-center font-mono"
        style={{ background: JUICE_BACKDROP }}
      >
        <div className="text-xs tracking-[0.5em] text-cyan [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
          ◆ WEAPON EVOLVED ◆
        </div>
        <div className="mt-1 text-2xl font-black uppercase tracking-widest text-cyan [text-shadow:0_3px_12px_rgba(0,0,0,0.95),0_0_22px_rgba(50,215,255,0.45)]">
          {shown.text.replace(/^EVOLVED — /, '')}
        </div>
      </div>
    );
  }

  // UNLOCK — a first-kill breadth reward (tree branch / next act / prestige seed).
  if (shown.kind === 'unlock') {
    return (
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 px-16 py-6 text-center font-mono"
        style={{ background: JUICE_BACKDROP }}
      >
        <div className="text-xs tracking-[0.5em] text-gold [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
          ◆ UNLOCKED ◆
        </div>
        <div className="mt-1 text-2xl font-black uppercase tracking-widest text-gold [text-shadow:0_3px_12px_rgba(0,0,0,0.95),0_0_22px_rgba(255,210,63,0.5)]">
          {shown.text}
        </div>
      </div>
    );
  }

  // WAVE — a scripted milestone burst. A mid-screen call-out, clearly NOT a boss.
  if (shown.kind === 'wave') {
    return (
      <div
        className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 px-14 py-4 text-center font-mono"
        style={{ background: JUICE_BACKDROP }}
      >
        <div className="text-[10px] tracking-[0.45em] text-ember [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
          ⚠ INCOMING ⚠
        </div>
        <div className="mt-1 text-2xl font-black uppercase tracking-widest text-bone [text-shadow:0_3px_12px_rgba(0,0,0,0.95)]">
          {shown.text}
        </div>
      </div>
    );
  }

  // ENEMY — a small new-class toast at the TOP-LEFT (same top line as the Warden /
  // Hostiles readouts), kept OFF the centre so it never covers the north gate.
  return (
    <div className="pointer-events-none absolute top-5 left-6 border border-rust/70 bg-pit/75 px-3 py-1.5 font-mono">
      <span className="text-[10px] uppercase tracking-widest text-dust">New threat — </span>
      <span className="text-sm font-bold tracking-wide text-bone">{shown.text}</span>
    </div>
  );
}

/** Boss-presence arena escalation (T75 feedback, V39 spirit). While ANY boss is on
 *  the field the stage reads hostile via a SUBTLE, STATIC edge vignette — ember for a
 *  miniboss, a heavier crimson for the final. Deliberately calm: no pulsing/blinking
 *  (there's already plenty on screen), it just eases in/out. Pure view. */
function BossVignette() {
  const active = useUiStore((s) => s.boss.active);
  const tier = useUiStore((s) => s.boss.tier);
  if (!active) return null;
  const isFinal = tier === 'final';
  // Edge-only darkening + a faint coloured rim — corners, not a screen-wide wash.
  const tint = isFinal ? 'rgba(200,40,30,0.22)' : 'rgba(196,106,43,0.15)';
  const edge = isFinal ? 'rgba(22,0,0,0.46)' : 'rgba(18,6,0,0.36)';
  const spread = isFinal ? '110px' : '80px';
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-1000"
      style={{ boxShadow: `inset 0 0 ${spread} ${edge}, inset 0 0 36px ${tint}` }}
    />
  );
}

function BossBar() {
  const boss = useUiStore((s) => s.boss);
  if (!boss.active) return null;
  const pct = Math.max(0, Math.min(1, boss.hp01)) * 100;
  const critical = boss.phase >= boss.phases - 1;
  const isFinal = boss.tier === 'final';
  // Final boss: wider, taller, gold-rimmed bar with a banner tag — a clearly bigger
  // moment than a miniboss's lean ember bar (T78, V39).
  return (
    <div
      className={`absolute bottom-24 left-1/2 -translate-x-1/2 font-mono ${
        isFinal ? 'w-[56rem] max-w-[92vw]' : 'w-[40rem] max-w-[80vw]'
      }`}
    >
      <div className="mb-1 flex items-end justify-between">
        <span
          className={`font-black uppercase tracking-[0.3em] ${
            isFinal
              ? 'text-lg text-gold drop-shadow-[0_0_16px_rgba(255,210,63,0.6)]'
              : 'text-sm text-ember drop-shadow-[0_0_10px_rgba(196,106,43,0.5)]'
          }`}
        >
          {isFinal && <span className="mr-2 text-ember">☠ FINAL</span>}
          {boss.name}
        </span>
        <span
          className={`uppercase tracking-widest ${
            isFinal ? 'text-[11px] text-gold/80' : 'text-[10px] text-dust'
          }`}
        >
          {isFinal ? 'Final Boss · ' : 'Miniboss · '}Phase {boss.phase + 1}/{boss.phases}
        </span>
      </div>
      <div
        className={`relative w-full overflow-hidden rounded-sm bg-pit/80 ${
          isFinal
            ? 'h-6 border-2 border-gold shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_24px_rgba(255,210,63,0.25)]'
            : 'h-4 border-2 border-rust shadow-[0_10px_30px_rgba(0,0,0,0.5)]'
        }`}
      >
        <div
          className={`h-full transition-[width] duration-200 ${
            critical ? 'bg-ember' : isFinal ? 'bg-gold' : 'bg-ember/80'
          }`}
          style={{ width: `${pct}%` }}
        />
        {Array.from({ length: boss.phases - 1 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-0.5 bg-pit/90"
            style={{ left: `${((i + 1) / boss.phases) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function WeaponName() {
  const weapon = useUiStore((s) => s.hud.weapon);
  if (!weapon) return null;
  return (
    <div className="absolute right-6 bottom-6 border border-rust/80 bg-pit/72 px-3 py-2 text-right font-mono">
      <div className="text-[10px] uppercase tracking-widest text-dust">Weapon</div>
      <div className="text-sm font-bold tracking-wide text-gold">{weapon}</div>
    </div>
  );
}

// Per-variant colour + silhouette glyph for the inspect chip (mirrors the
// render-side VARIANT_COLORS / shape families).
function CountdownBackdrop() {
  const countdown = useUiStore((s) => s.hud.countdown);
  const active = countdown > 0;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (active) {
      setShow(true);
      return;
    }
    const t = setTimeout(() => setShow(false), 700); // let the fade finish, then unmount
    return () => clearTimeout(t);
  }, [active]);
  if (!show) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 bg-pit/55 backdrop-blur-[2px] transition-opacity duration-700 ease-out"
      style={{ opacity: active ? 1 : 0 }}
    />
  );
}

function Countdown() {
  const countdown = useUiStore((s) => s.hud.countdown);
  if (countdown <= 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="flex h-64 w-64 items-center justify-center"
        style={{ background: JUICE_BACKDROP }}
      >
        <span className="font-mono text-[7.5rem] font-bold leading-none text-bone tabular-nums [text-shadow:0_4px_20px_rgba(0,0,0,0.95)]">
          {Math.ceil(countdown)}
        </span>
      </div>
    </div>
  );
}

function ResetView() {
  const resetView = useUiStore((s) => s.resetView);
  const cameraControls = useUiStore((s) => s.settings.cameraControls);
  if (!cameraControls) return null; // no orbit/zoom → nothing to reset
  return (
    <button
      onClick={resetView}
      title="Reset camera view (right-drag to orbit · scroll to zoom)"
      className="pointer-events-auto absolute bottom-20 left-1/2 -translate-x-1/2 rounded-sm border border-rust bg-pit/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-bone/60 transition hover:border-gold hover:text-bone focus:outline-none"
    >
      ⟳ Reset view
    </button>
  );
}

// First-run field briefing — a START GATE: the sim is held (world.started=false)
// until the player dismisses. Reuses the shared ControlsReference table (single
// source of truth with Settings → Controls), shows just the Combat group. By
// default it reappears every fresh load so a new player gets a second chance to
// read it; ticking "Don't show again" persists the suppression.
export function Hud() {
  return (
    <>
      <BossVignette />
      <HealthBar />
      <ShieldPips />
      <HotBar />
      <Timer />
      <LevelXp />
      <EnemyCounter />
      <WeaponName />
      <InspectPanel />
      <BossBar />
      <Announce />
      <CountdownBackdrop />
      <Countdown />
      <ControlsHint />
      <ResetView />
    </>
  );
}
