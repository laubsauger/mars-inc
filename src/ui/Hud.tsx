// Combat HUD (§13.2 minimal). Each widget subscribes to its own store slice so
// a health change never re-renders the sprint widget, and vice versa.

import { useEffect, useState } from 'react';
import { useUiStore, type AnnounceState } from './store';

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

function SprintPips() {
  const charges = useUiStore((s) => s.hud.sprintCharges);
  const cd01 = useUiStore((s) => s.hud.sprintCooldown01);
  const total = Math.max(charges, 1);
  return (
    <div className="absolute bottom-6 left-72 ml-4 flex items-end gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < charges;
        return (
          <div
            key={i}
            className={`h-6 w-2.5 rounded-sm border border-rust ${filled ? 'bg-ember' : 'bg-pit/70'}`}
            style={!filled && i === charges ? { opacity: 0.3 + cd01 * 0.7 } : undefined}
          />
        );
      })}
    </div>
  );
}

function Timer() {
  const elapsed = useUiStore((s) => s.hud.elapsed);
  const m = Math.floor(elapsed / 60);
  const sec = Math.floor(elapsed % 60);
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 font-mono text-lg tracking-widest text-bone/90">
      {m}:{sec.toString().padStart(2, '0')}
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
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 text-center font-mono">
        <div className="text-xs tracking-[0.5em] text-ember">⚠ WARDEN INBOUND ⚠</div>
        <div className="mt-1 text-3xl font-black uppercase tracking-widest text-gold drop-shadow-[0_0_22px_rgba(255,210,63,0.55)]">
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

function Countdown() {
  const countdown = useUiStore((s) => s.hud.countdown);
  if (countdown <= 0) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex h-44 w-44 items-center justify-center rounded-full bg-pit/72 shadow-[0_0_70px_rgba(0,0,0,0.75)] ring-2 ring-ember/40 backdrop-blur-sm">
        <div className="font-mono text-8xl font-bold tracking-widest text-sun [text-shadow:0_3px_14px_rgba(0,0,0,0.95)]">
          {Math.ceil(countdown)}
        </div>
      </div>
    </div>
  );
}

function PausedOverlay() {
  const paused = useUiStore((s) => s.hud.paused);
  if (!paused) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-pit/60">
      <div className="font-mono text-3xl tracking-widest text-ember">PAUSED</div>
    </div>
  );
}

function ResetView() {
  const resetView = useUiStore((s) => s.resetView);
  return (
    <button
      onClick={resetView}
      title="Reset camera view (right-drag to orbit · scroll to zoom)"
      className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 rounded-sm border border-rust bg-pit/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-bone/60 transition hover:border-gold hover:text-bone focus:outline-none"
    >
      ⟳ Reset view
    </button>
  );
}

export function Hud() {
  return (
    <>
      <HealthBar />
      <SprintPips />
      <Timer />
      <LevelXp />
      <EnemyCounter />
      <WeaponName />
      <BossBar />
      <Announce />
      <Countdown />
      <ResetView />
      <PausedOverlay />
    </>
  );
}
