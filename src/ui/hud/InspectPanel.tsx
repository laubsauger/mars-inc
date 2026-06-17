// HUD hover-inspect panel: mini character sheet for the enemy under the cursor.
// Split from Hud.tsx.
import { useUiStore } from '../store';

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

export function InspectPanel() {
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
