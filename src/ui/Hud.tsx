// Combat HUD (§13.2 minimal). Each widget subscribes to its own store slice so
// a health change never re-renders the sprint widget, and vice versa.

import { useEffect, useState } from 'react';
import { useUiStore, type AnnounceState } from './store';
import { ControlsReference } from './controls-reference';

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
function AbilitySlot({
  icon,
  keyLabel,
  name,
  progress,
  accent,
  charges,
  maxCharges,
}: {
  icon: string;
  keyLabel: string;
  name: string;
  progress: number; // 0..1 (1 = ready)
  accent: string; // hex
  charges?: number | undefined; // current charges available
  maxCharges?: number | undefined; // total charges (>1 → show pips)
}) {
  const p = Math.max(0, Math.min(1, progress));
  const ready = p >= 1;
  const deg = p * 360;
  // 0..1 → 2-digit alpha hex, so the border + glow can ramp with the recharge.
  const a2 = (v: number): string =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return (
    <div
      title={name}
      className="relative flex h-14 w-14 items-center justify-center rounded-md border-2 bg-pit/82 font-mono"
      style={{
        // Border brightens + the glow grows as the slot charges → the border IS
        // part of the readout, full accent + bloom the instant it's ready.
        borderColor: ready ? accent : `${accent}${a2(0.3 + 0.6 * p)}`,
        boxShadow: `0 0 ${8 + 14 * p}px ${accent}${a2(0.12 + 0.5 * p)}, inset 0 0 0 1px rgba(7,5,4,0.8)`,
      }}
    >
      {!ready && (
        <>
          {/* Darken the whole face while charging so "not ready" reads at a glance. */}
          <div className="pointer-events-none absolute inset-0 rounded-[3px] bg-pit/70" />
          {/* The charged arc, swept in the accent colour — the prominent reveal. */}
          <div
            className="pointer-events-none absolute inset-0 rounded-[3px]"
            style={{
              background: `conic-gradient(from 0deg, ${accent}8c ${deg}deg, transparent ${deg}deg)`,
            }}
          />
          {/* Bright leading-edge "sweep hand" that travels the ring as it fills. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ transform: `rotate(${deg}deg)` }}
          >
            <div
              className="absolute left-1/2 top-0 h-1/2 w-[2px] -translate-x-1/2 origin-bottom"
              style={{ background: accent, boxShadow: `0 0 7px ${accent}` }}
            />
          </div>
        </>
      )}
      <span
        className="relative text-2xl leading-none"
        style={{
          color: ready ? accent : 'rgba(244,228,212,0.55)',
          textShadow: ready ? `0 0 10px ${accent}99` : undefined,
        }}
      >
        {icon}
      </span>
      <span className="absolute -top-1.5 left-1 z-10 text-[9px] font-black uppercase tracking-widest text-bone/55">
        {keyLabel}
      </span>
      {/* Charge pips — one per max charge, filled = available. Makes it obvious the
          ability is still usable while a spent charge recharges (sprint, etc.). */}
      {maxCharges && maxCharges > 1 ? (
        <div className="absolute -bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5">
          {Array.from({ length: maxCharges }).map((_, i) => {
            const filled = i < (charges ?? 0);
            return (
              <span
                key={i}
                className="h-1.5 w-1.5 rotate-45 border"
                style={{
                  borderColor: accent,
                  background: filled ? accent : 'rgba(7,5,4,0.85)',
                  boxShadow: filled ? `0 0 5px ${accent}aa` : undefined,
                  opacity: filled ? 1 : 0.4,
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function HotBar() {
  const grenade01 = useUiStore((s) => s.hud.grenade01);
  const charges = useUiStore((s) => s.hud.sprintCharges);
  const sprintMax = useUiStore((s) => s.hud.sprintMax);
  const sprintCd01 = useUiStore((s) => s.hud.sprintCooldown01);
  const autoShoot = useUiStore((s) => s.hud.autoShoot);
  // Sprint slot is "ready" while at least one charge is available; otherwise it
  // shows the next charge's refill sweep.
  const sprintProgress = charges > 0 ? 1 : sprintCd01;
  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-end gap-3">
      <AbilitySlot
        icon="✸"
        keyLabel="RMB"
        name="Grenade — AoE knockback"
        progress={grenade01}
        accent="#ff5a36"
      />
      <AbilitySlot
        icon="»"
        keyLabel="SHIFT"
        name="Sprint"
        progress={sprintProgress}
        accent="#32d7ff"
        charges={charges}
        maxCharges={sprintMax}
      />
      {autoShoot ? (
        <div className="mb-1 self-center rounded-sm border border-toxic/70 bg-toxic/12 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-widest text-toxic">
          Auto-fire
        </div>
      ) : null}
    </div>
  );
}

/** Compact boss-arrival countdown that sits beside the run clock — a quiet amber
 *  ticket that flips to an urgent pulsing bleed-red inside the last 15s. Hidden
 *  while a boss is on the field (the boss health bar takes over). */
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
  const m = Math.floor(elapsed / 60);
  const sec = Math.floor(elapsed % 60);
  return (
    <div className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-3 font-mono">
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
  return (
    <div className="absolute top-5 right-6 min-w-28 border border-rust/80 bg-pit/72 px-3 py-2 text-right font-mono shadow-[0_12px_34px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(240,200,121,0.08)]">
      <div className="text-[10px] uppercase text-dust">Hostiles</div>
      <div className="text-2xl font-black leading-none text-gold tabular-nums">{enemiesAlive}</div>
    </div>
  );
}

function Announce() {
  const announce = useUiStore((s) => s.announce);
  const [shown, setShown] = useState<AnnounceState | null>(null);

  useEffect(() => {
    if (!announce) return;
    setShown(announce);
    const ms = announce.kind === 'boss' ? 3200 : 1900;
    const t = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(t);
    // Re-fire whenever a new event id arrives.
  }, [announce?.id, announce]);

  if (!shown) return null;

  if (shown.kind === 'boss') {
    return (
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 px-20 py-8 text-center font-mono"
        style={{ background: JUICE_BACKDROP }}
      >
        <div className="text-xs tracking-[0.5em] text-ember [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
          ⚠ WARDEN INBOUND ⚠
        </div>
        <div className="mt-1 text-3xl font-black uppercase tracking-widest text-gold [text-shadow:0_3px_12px_rgba(0,0,0,0.95),0_0_22px_rgba(255,210,63,0.45)]">
          {shown.text}
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 border border-rust/70 bg-pit/75 px-3 py-1.5 text-center font-mono">
      <span className="text-[10px] uppercase tracking-widest text-dust">New threat — </span>
      <span className="text-sm font-bold tracking-wide text-bone">{shown.text}</span>
    </div>
  );
}

function BossBar() {
  const boss = useUiStore((s) => s.boss);
  if (!boss.active) return null;
  const pct = Math.max(0, Math.min(1, boss.hp01)) * 100;
  const critical = boss.phase >= boss.phases - 1;
  return (
    <div className="absolute bottom-24 left-1/2 w-[44rem] max-w-[82vw] -translate-x-1/2 font-mono">
      <div className="mb-1 flex items-end justify-between">
        <span className="text-sm font-black uppercase tracking-[0.3em] text-ember drop-shadow-[0_0_10px_rgba(196,106,43,0.5)]">
          {boss.name}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-dust">
          Phase {boss.phase + 1}/{boss.phases}
        </span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-sm border-2 border-rust bg-pit/80 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div
          className={`h-full transition-[width] duration-200 ${critical ? 'bg-ember' : 'bg-gold'}`}
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
const INSPECT_COLOR = [
  '#6f8a7d', // mite
  '#9c4326', // hound
  '#d84cff', // gatekeeper (boss)
  '#83f04f', // lobber
  '#d8b46a', // marshal
  '#ff3b30', // mortar
  '#ffd23f', // shotgunner
  '#b9a07a', // brute
  '#32d7ff', // frost auditor
  '#83f04f', // blob
  '#83f04f', // blobling
];
const INSPECT_GLYPH = ['▲', '▬', '✦', '⬢', '▮', '⬢', '◣', '⬛', '⬢', '●', '●'];

function InspectPanel() {
  const inspect = useUiStore((s) => s.inspect);
  if (!inspect) return null;
  const { name, variant, hp, maxHp, contactDamage, speed, isBoss, splitter, ranged, statuses } =
    inspect;
  const color = INSPECT_COLOR[variant] ?? '#bbbbbb';
  const glyph = INSPECT_GLYPH[variant] ?? '◆';
  const frac = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0));
  return (
    <div className="pointer-events-none absolute right-6 bottom-[7rem] w-60 border border-rust/80 bg-pit/82 px-3 py-2 font-mono shadow-[0_12px_34px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(240,200,121,0.08)]">
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border text-lg"
          style={{ color, borderColor: color, background: `${color}1f` }}
        >
          {glyph}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-bone">{name}</div>
          <div className="text-[10px] uppercase tracking-widest text-dust">
            {isBoss ? 'Boss' : splitter ? 'Splitter' : ranged ? 'Ranged' : 'Hostile'}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase text-dust">
        <span>HP</span>
        <span className="tabular-nums text-bone/80">
          {hp} / {maxHp}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-sm border border-rust/70 bg-pit/70">
        <div
          className="h-full transition-[width] duration-150"
          style={{ width: `${frac * 100}%`, background: isBoss ? '#d84cff' : '#ff3b30' }}
        />
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-bone/70">
        <span className="flex justify-between">
          <span className="text-dust">Touch</span>
          <span className="tabular-nums">{contactDamage}</span>
        </span>
        <span className="flex justify-between">
          <span className="text-dust">Speed</span>
          <span className="tabular-nums">{speed}</span>
        </span>
        {ranged && (
          <span className="col-span-2 flex justify-between">
            <span className="text-dust">{ranged.kind === 'gun' ? 'Gun' : 'Lob'}</span>
            <span className="tabular-nums">
              {ranged.damage} dmg @ {ranged.range}m
            </span>
          </span>
        )}
      </div>

      {statuses.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {statuses.map((s) => (
            <span
              key={s}
              className="rounded-sm border border-cyan/50 bg-cyan/10 px-1 text-[9px] uppercase tracking-wide text-cyan"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Slightly opaque dim behind the countdown so the arena reads as "not live yet".
 *  Fades out the instant the run goes live (countdown hits 0). */
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
function ControlsHint() {
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

export function Hud() {
  return (
    <>
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
