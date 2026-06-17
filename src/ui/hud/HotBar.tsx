// HUD ability hotbar (T-grenade/sprint): radial-cooldown slots. Split from Hud.tsx.
import { useUiStore } from '../store';

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

export function HotBar() {
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
