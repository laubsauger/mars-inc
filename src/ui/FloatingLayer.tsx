// World-anchored floating text (T33): damage numbers + pickup labels, projected
// to screen by the render loop and rendered here as a bounded DOM overlay. Every
// label gets a radial-gradient backdrop + hard text-shadow so it reads over busy
// combat (AAA legibility, not bare text on noise).

import { useUiStore } from './store';

// Soft elliptical drop-shadow behind the glyphs — the readability backdrop.
const BACKDROP = 'radial-gradient(ellipse at center, rgba(7,5,4,0.82) 0%, rgba(7,5,4,0) 72%)';
const SHADOW = '0 2px 7px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95)';

export function FloatingLayer() {
  const labels = useUiStore((s) => s.labels);
  if (labels.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {labels.map((l) => {
        const isPickup = l.kind === 'pickup';
        return (
          <div
            key={l.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono tabular-nums ${
              isPickup && !l.active ? 'font-semibold' : 'font-black'
            }`}
            style={{
              left: l.x,
              top: l.y,
              color: l.color,
              fontSize: l.size,
              opacity: l.opacity,
              textShadow: SHADOW,
              background: isPickup && !l.active ? undefined : BACKDROP,
              padding: isPickup ? '1px 8px' : '0 8px',
              borderRadius: 4,
              letterSpacing: isPickup ? '0.06em' : undefined,
            }}
          >
            {isPickup ? (
              <span className="inline-flex items-center gap-1.5">
                <kbd className="rounded border border-current px-1 text-[0.8em] leading-tight opacity-90">
                  E
                </kbd>
                {l.text}
              </span>
            ) : (
              l.text
            )}
          </div>
        );
      })}
    </div>
  );
}
