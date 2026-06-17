import { useUiStore } from '../../store';
import { WEAPONS } from '../../../content/weapons/index';
import { Panel, Stat } from './shared';

const WEAPON_FAMILY_COLOR: Record<string, string> = {
  sidearm: '#d8b46a',
  rotary: '#c46a2b',
  explosive: '#ff3b30',
  energy: '#32d7ff',
  orbital: '#ffd23f',
  drone: '#83f04f',
};

function recoilLabel(r: number): string {
  return r <= 4 ? 'Low' : r <= 12 ? 'Medium' : r <= 20 ? 'High' : 'Brutal';
}

/** Derive a one-line identity from the weapon's stats (no per-id hardcoding). */
function weaponTradeoff(w: (typeof WEAPONS)[number]): string {
  if ((w.pellets ?? 1) > 1) return 'Point-blank scatter — devastating up close, useless at range.';
  if (w.explosiveRadius) return 'AoE on impact — huge punch, slow fire, brutal recoil.';
  if (w.cooldown < 0.1) return 'Bullet hose — its recoil shoves you off your aim.';
  if ((w.projectile.pierce ?? 0) >= 2)
    return 'Punches through lined-up crowds; soft single-target.';
  if (w.range >= 28) return 'Long-range sniper — keeps the whole arena in threat.';
  return 'Reliable all-rounder with low recoil.';
}

export function ArsenalPanel() {
  const discovered = useUiStore((s) => s.profile.discoveredWeapons);
  const seen = new Set(discovered);
  const foundCount = WEAPONS.filter((w) => seen.has(w.id)).length;
  return (
    <Panel title="ARSENAL">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-bone/60">
        <span>
          Every weapon trades power for a cost — no single gun wins. Slots stay ??? until you
          DISCOVER each weapon by picking it up in a run.
        </span>
        <span className="shrink-0 font-black tabular-nums text-gold">
          {foundCount}/{WEAPONS.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {WEAPONS.map((w) => {
          if (!seen.has(w.id)) {
            // Undiscovered → a mystery slot. Reads as "something's here, go find it".
            return (
              <div
                key={w.id}
                className="relative flex min-h-[7.5rem] flex-col items-center justify-center overflow-hidden rounded-sm border border-dashed border-rust/45 bg-pit/55 p-3 text-center"
                title="Undiscovered — find this weapon in a run to reveal it"
              >
                <div className="text-2xl font-black tracking-[0.3em] text-bone/25">???</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-bone/35">
                  Locked contract
                </div>
                <div className="mt-0.5 text-[10px] text-bone/30">Discover it in the pit</div>
              </div>
            );
          }
          const color = WEAPON_FAMILY_COLOR[w.family] ?? '#bbb';
          const dps = ((w.damage.base * (w.pellets ?? 1)) / w.cooldown).toFixed(0);
          const rate = (1 / w.cooldown).toFixed(1);
          return (
            <div
              key={w.id}
              className="relative overflow-hidden rounded-sm border border-rust/70 bg-umber/80 p-3 shadow-[inset_0_0_0_1px_rgba(7,5,4,0.7)]"
            >
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-black text-bone">{w.displayName}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-widest" style={{ color }}>
                  {w.family} · T{w.tier}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] text-bone/75">
                <Stat label="DPS~" value={dps} />
                <Stat label="Rate/s" value={rate} />
                <Stat label="Range" value={`${w.range}`} />
                <Stat label="Dmg" value={`${w.damage.base}${w.pellets ? `×${w.pellets}` : ''}`} />
                <Stat label="Recoil" value={recoilLabel(w.recoil)} />
                <Stat label="Pierce" value={`${w.projectile.pierce ?? 0}`} />
              </div>
              <div className="mt-2 border-t border-rust/40 pt-1.5 text-[11px] leading-4 text-bone/60">
                {weaponTradeoff(w)}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
