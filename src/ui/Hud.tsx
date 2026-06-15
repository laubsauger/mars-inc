// Combat HUD (§13.2 minimal). Each widget subscribes to its own store slice so
// a health change never re-renders the sprint widget, and vice versa.

import { useUiStore } from './store';

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

function PausedOverlay() {
  const paused = useUiStore((s) => s.hud.paused);
  if (!paused) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-pit/60">
      <div className="font-mono text-3xl tracking-widest text-ember">PAUSED</div>
    </div>
  );
}

export function Hud() {
  return (
    <>
      <HealthBar />
      <SprintPips />
      <Timer />
      <LevelXp />
      <PausedOverlay />
    </>
  );
}
