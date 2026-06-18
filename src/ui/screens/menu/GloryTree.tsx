// Glory Tree menu panel (T26/T35): browse + buy permanent upgrades on a radial
// skill tree. Extracted from MainMenu.tsx (~700 lines) for maintainability.
import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../store';
import { PermanentTooltipBody } from '../../components/PermanentTooltipBody';
import { PERMANENT_UPGRADES } from '../../../content/permanent/index';

type GloryBranch = 'arsenal' | 'biology' | 'mobility' | 'command' | 'arena' | 'infamy';

const BRANCHES: { id: GloryBranch; label: string; blurb: string }[] = [
  { id: 'mobility', label: 'Mobility', blurb: 'Speed, sprint & kinetics' },
  { id: 'biology', label: 'Biology', blurb: 'Survival, sustain & second chances' },
  { id: 'arsenal', label: 'Arsenal', blurb: 'Firepower, drafting & amplifiers' },
  { id: 'command', label: 'Command', blurb: 'Drones & automated ordnance' },
  { id: 'arena', label: 'Arena', blurb: 'Glory economy & sponsors' },
  { id: 'infamy', label: 'Infamy', blurb: 'Rule-breaking risk & blood economy' },
];

const BRANCH_ORDER = BRANCHES.map((b) => b.id);
const RARITY_ICON: Record<string, string> = { common: '•', rare: '◆', legendary: '★' };

function gloryBranch(branch: string): GloryBranch {
  return (BRANCH_ORDER as string[]).includes(branch) ? (branch as GloryBranch) : 'mobility';
}

// ── Auto-layout (T35 reweave) ────────────────────────────────────────────────
// The root sits at CENTRE; each branch RADIATES outward on its own spoke (6
// branches → evenly spaced around the circle), nodes stacked cheap→far along the
// spoke. Generated from the catalog so any branch/node set lays out organically
// without hand-placing — the tree grows like a real web as content lands.
type NodeLayout = { x: number; y: number; branch: GloryBranch; icon: string };
type TreeNodeId = string;

const TREE_NODES: Record<string, NodeLayout> = {
  root: { x: 50, y: 50, branch: 'mobility', icon: '◆' },
};
const TREE_EDGES: Array<[TreeNodeId, TreeNodeId]> = [];
const TREE_PARENT: Record<string, TreeNodeId> = {};
const TREE_ORBITS: Array<{ x: number; y: number; r: number; branch: GloryBranch }> = [];

{
  // The canvas is 1140×920 (x-units ~1.24× wider than y on screen), so COMPRESS x to
  // keep the radial star round instead of flattening the diagonal spokes.
  const XS = 0.81;
  const R0 = 11; // depth-0 node distance from the hub (tight — inner rings hug the core)
  // Radius grows NEARLY linearly with a gentle curve: even ring spacing (no dead gaps
  // on sparse chains) with just a touch more room outward. Outer crowding is handled by
  // the ANGULAR allocation (each branch's arc is sized by its node count), not by
  // blowing rings far apart — that aired out the chains and detached the tips.
  const radiusAt = (depth: number, lenMul: number) =>
    (R0 + 9 * depth + 0.5 * depth * depth) * lenMul;

  // ── Pass 1: build each branch's ordered node list (legendaries spliced mid-outer
  //    as internal milestones), so we can size each branch's angular arc by its count. ──
  const built = BRANCH_ORDER.map((branch, bi) => {
    const all = PERMANENT_UPGRADES.filter((u) => u.branch === branch)
      .slice()
      .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
    const legs = all.filter((u) => u.rarity === 'legendary');
    const nodes = all.filter((u) => u.rarity !== 'legendary');
    legs.forEach((lg, i) => {
      const frac = legs.length === 1 ? 0.55 : 0.4 + 0.42 * (i / (legs.length - 1));
      const pos = Math.min(nodes.length, Math.max(2, Math.round(nodes.length * frac)));
      nodes.splice(pos, 0, lg);
    });
    // ORGANIC length: branches aren't all the same reach. A deterministic per-branch
    // factor (0.86…1.18) stretches some spokes longer, foreshortens others — the star
    // looks grown, not stamped. Keyed to branch index so it's stable across renders.
    const lenMul = 0.86 + ((bi * 7 + 3) % 5) * 0.08;
    return { branch, nodes, lenMul };
  }).filter((b) => b.nodes.length > 0);

  // ── Pass 2: allocate each branch an angular ARC proportional to its node count
  //    (bushy branches get more room → no rim crowding; sparse branches stay narrow),
  //    laid sequentially around the circle with a gap between spokes. ──
  const GAP = 0.3; // fraction of each arc reserved as empty gutter — keeps spokes in lanes
  const totalNodes = built.reduce((s, b) => s + b.nodes.length, 0);
  let cur = -Math.PI / 2; // start at the top
  built.forEach(({ branch, nodes, lenMul }) => {
    const arc = (2 * Math.PI * nodes.length) / totalNodes;
    const center = cur + arc / 2;
    const sector = arc * (1 - GAP);
    cur += arc;

    const count = nodes.length;
    const kids = (k: number) => [2 * k + 1, 2 * k + 2].filter((c) => c < count);
    const leaves: number[] = new Array(count).fill(0);
    const countLeaves = (k: number): number => {
      const ch = kids(k);
      if (ch.length === 0) return (leaves[k] = 1);
      let s = 0;
      for (const c of ch) s += countLeaves(c);
      return (leaves[k] = s);
    };
    countLeaves(0);
    // SMART packing via a FORK-AWARE radial step + monotonic radius: a child whose
    // parent FORKS (≥2 kids) steps out farther (more arc length at the same angle, so
    // diverging siblings don't bunch), while a CHAIN (single child) takes a small step
    // (no dead space). Radius never goes inside the parent, so no edge points inward.
    let maxDepth = 0;
    const place = (
      k: number,
      a0: number,
      a1: number,
      depth: number,
      parentR: number,
      sibCount: number,
    ) => {
      if (depth > maxDepth) maxDepth = depth;
      // Step from the parent: a fork needs spread (siblings share the parent's wedge,
      // so push them out to gain arc); a chain hugs tight.
      const step = sibCount > 1 ? 13 : 7.5;
      const radius = Math.max(radiusAt(depth, lenMul), parentR + step);
      const a = (a0 + a1) / 2; // node sits at the centre of its wedge
      TREE_NODES[nodes[k]!.id] = {
        x: 50 + Math.cos(a) * radius * XS,
        y: 50 + Math.sin(a) * radius,
        branch,
        icon: RARITY_ICON[nodes[k]!.rarity] ?? '•',
      };
      const parent = k === 0 ? 'root' : nodes[(k - 1) >> 1]!.id;
      TREE_PARENT[nodes[k]!.id] = parent;
      TREE_EDGES.push([parent, nodes[k]!.id]);
      const ch = kids(k);
      if (ch.length === 0) return;
      const total = ch.reduce((s, c) => s + leaves[c]!, 0);
      let a0c = a0;
      for (const c of ch) {
        const span = (a1 - a0) * (leaves[c]! / total);
        place(c, a0c, a0c + span, depth + 1, radius, ch.length);
        a0c += span;
      }
    };
    place(0, center - sector / 2, center + sector / 2, 0, 0, 1);
    const midR = radiusAt(maxDepth, lenMul) / 2;
    TREE_ORBITS.push({
      x: 50 + Math.cos(center) * midR * XS,
      y: 50 + Math.sin(center) * midR,
      r: 9,
      branch,
    });
  });
}

function isTreeNodeId(id: string): id is TreeNodeId {
  return id in TREE_NODES;
}

function branchPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  // Gentle bow PERPENDICULAR to the segment (consistent rotational sway) so radial
  // spokes read as organic vines rather than always arcing "up".
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(3, len * 0.08); // gentle sway — a heavy bow detached tips from the line
  const mx = (from.x + to.x) / 2 + (-dy / len) * bow;
  const my = (from.y + to.y) / 2 + (dx / len) * bow;
  return `M ${from.x} ${from.y} Q ${mx} ${my}, ${to.x} ${to.y}`;
}

// Branch colours: Arsenal = RED (firepower), Biology = GREEN (survival), Mobility
// = BLUE (speed). Gold/yellow is reserved for MAXED nodes; orange for LEGENDARY
// keystones (LEGENDARY_STYLE) — a node's colour reads its meaning at a glance.
const BRANCH_STYLE = {
  arsenal: {
    line: 'stroke-bleed',
    stroke: '#ff3b30',
    bg: 'bg-bleed',
    border: 'border-bleed',
    text: 'text-bleed',
    ring: 'shadow-[0_0_22px_rgba(255,59,48,0.32)]',
  },
  biology: {
    line: 'stroke-toxic',
    stroke: '#83f04f',
    bg: 'bg-toxic',
    border: 'border-toxic',
    text: 'text-toxic',
    ring: 'shadow-[0_0_22px_rgba(131,240,79,0.25)]',
  },
  mobility: {
    line: 'stroke-cyan',
    stroke: '#32d7ff',
    bg: 'bg-cyan',
    border: 'border-cyan',
    text: 'text-cyan',
    ring: 'shadow-[0_0_22px_rgba(50,215,255,0.3)]',
  },
  command: {
    line: 'stroke-elite',
    stroke: '#d84cff',
    bg: 'bg-elite',
    border: 'border-elite',
    text: 'text-elite',
    ring: 'shadow-[0_0_22px_rgba(216,76,255,0.3)]',
  },
  arena: {
    line: 'stroke-sun',
    stroke: '#ff9d3c',
    bg: 'bg-sun',
    border: 'border-sun',
    text: 'text-sun',
    ring: 'shadow-[0_0_22px_rgba(255,157,60,0.3)]',
  },
  infamy: {
    line: 'stroke-ember',
    stroke: '#ff5a36',
    bg: 'bg-ember',
    border: 'border-ember',
    text: 'text-ember',
    ring: 'shadow-[0_0_22px_rgba(255,90,54,0.3)]',
  },
} as const;

// Legendary keystones override their branch colour with ORANGE so the build-
// defining nodes pop out of the tree (their branch-coloured EDGES still show
// which arm they sit on).
const LEGENDARY_STYLE = {
  line: 'stroke-legendary',
  stroke: '#ff8c1a',
  bg: 'bg-legendary',
  border: 'border-legendary',
  text: 'text-legendary',
  ring: 'shadow-[0_0_26px_rgba(255,140,26,0.5)]',
} as const;

export function GloryTree() {
  const meta = useUiStore((s) => s.meta);
  const buy = useUiStore((s) => s.buyPermanent);
  const setMenuView = useUiStore((s) => s.setMenuView);
  const resetPermanents = useUiStore((s) => s.resetPermanents);
  const prestige = useUiStore((s) => s.prestige);
  const buyPrestigeNode = useUiStore((s) => s.buyPrestigeNode);

  const [confirmReset, setConfirmReset] = useState(false);
  const [showPrestige, setShowPrestige] = useState(false);
  const [confirmPrestige, setConfirmPrestige] = useState(false);
  // Dev affordance: reveal the WHOLE tree to study it. Off (production) reveals
  // step-by-step from the frontier, so first-time players don't see the far ends.
  // Defaults ON in dev builds, hidden + off in production.
  const [revealAll, setRevealAll] = useState(import.meta.env.DEV);
  const spent = meta.permanents.reduce((s, p) => s + p.spent, 0);
  const [hovered, setHovered] = useState<TreeNodeId | null>(null);
  // Start zoomed out a touch — the tree is bigger than the viewport now, so the
  // player sees the whole sprawl first, then pans/zooms into a branch.
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.98 });
  const drag = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
    nx: number;
    ny: number;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);

  const byId = new Map(meta.permanents.map((p) => [p.id, p]));
  const ownedOf = (id: string | undefined): number =>
    id === 'root' ? 1 : id ? (byId.get(id)?.owned ?? 0) : 0;
  const isUnlocked = (id: TreeNodeId): boolean => {
    const parent = TREE_PARENT[id];
    return parent === undefined || ownedOf(parent) > 0;
  };
  // Fog of war (discovery): only REACHABLE nodes show their identity. The NEXT
  // layer (children of reachable nodes) renders as a ⊘ mystery — visible but
  // unknown. Anything DEEPER isn't drawn at all; a fading connector merely HINTS
  // it exists. So the tree reveals itself a layer at a time instead of dumping the
  // whole sprawl at once. Dev "Reveal: All" overrides everything.
  const isFrontier = (id: TreeNodeId): boolean => {
    const parent = TREE_PARENT[id];
    return parent !== undefined && isUnlocked(parent); // parent reachable, self not
  };
  // A node is DRAWN if reachable or one-past (the mystery layer).
  const nodeVisible = (id: TreeNodeId): boolean => revealAll || isUnlocked(id) || isFrontier(id);
  // A node shows its real icon/identity only when reachable; the mystery layer is ⊘.
  const iconRevealed = (id: TreeNodeId): boolean => revealAll || isUnlocked(id);
  const hoveredRevealed = hovered ? iconRevealed(hovered) : false;
  const hoveredP = hovered ? byId.get(hovered) : undefined;
  const hoveredBranch = hovered ? gloryBranch(TREE_NODES[hovered]!.branch) : 'mobility';
  const hoveredLocked = hovered ? !isUnlocked(hovered) : false;
  const hoveredParent = hovered ? TREE_PARENT[hovered] : undefined;

  const clampScale = (s: number) => Math.min(2.4, Math.max(0.6, s));
  // Write the pan transform DIRECTLY to the inner layer during a drag — NEVER via
  // React state per move, or every pointermove re-renders all 37 nodes + 76 SVG
  // paths (the sluggish pan). State is committed only once, on pointer-up.
  const applyPan = (x: number, y: number, scale: number) => {
    if (panRef.current)
      panRef.current.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${scale})`;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y, nx: view.x, ny: view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHovered(null); // drop any tooltip; hover is suppressed for the whole drag
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.nx = d.ox + (e.clientX - d.px);
    d.ny = d.oy + (e.clientY - d.py);
    applyPan(d.nx, d.ny, view.scale); // direct DOM write, no re-render
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d) setView((v) => ({ ...v, x: d.nx, y: d.ny })); // commit once
  };
  const reset = () => setView({ x: 0, y: 0, scale: 0.98 });

  // Wheel zoom via a non-passive listener (React's onWheel is passive → can't
  // preventDefault the page scroll, and we must never scroll the page — rule #1).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({ ...v, scale: clampScale(v.scale - e.deltaY * 0.0014) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Escape closes the tree → back to the menu root.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuView('root');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMenuView]);

  // The radial layout already applies its own aspect compression (XS), so px() is a
  // straight pass-through now — no extra horizontal squeeze on top.
  const COMPRESS = 1;
  const px = (x: number) => 50 + (x - 50) * COMPRESS;
  const proj = (n: { x: number; y: number }) => ({ x: px(n.x), y: n.y });

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(50,215,255,0.08),transparent_36%),radial-gradient(circle_at_78%_30%,rgba(255,210,63,0.08),transparent_34%),radial-gradient(circle_at_22%_36%,rgba(131,240,79,0.07),transparent_32%),linear-gradient(#070504,#070504)] font-mono">
      {/* Slim top bar — title, legend, glory pill, back. No logo, minimal height. */}
      <header className="flex shrink-0 items-center gap-4 border-b border-rust/60 bg-pit/70 py-2 pl-5 pr-16">
        <div className="shrink-0">
          <div className="text-[10px] uppercase tracking-widest text-dust">Mars Inc terminal</div>
          <div className="text-lg font-black leading-none text-bone">GLORY TREE</div>
        </div>
        <div className="flex flex-1 items-center justify-center gap-2">
          {BRANCHES.map((b) => {
            const style = BRANCH_STYLE[b.id];
            const total = meta.permanents
              .filter((p) => p.branch === b.id)
              .reduce((sum, p) => sum + p.owned, 0);
            return (
              <div
                key={b.id}
                className={`flex items-center gap-2 border bg-pit/55 px-3 py-1 ${style.border}`}
                title={b.blurb}
              >
                <span className={`text-[11px] font-black uppercase ${style.text}`}>{b.label}</span>
                <span className="text-[10px] text-bone/55">{total} pts</span>
              </div>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-1.5 border border-gold/50 bg-pit/60 px-3 py-1">
            <span className="text-[10px] uppercase tracking-widest text-dust">Glory</span>
            <span className="text-base font-black tabular-nums text-gold">
              &#9670; {meta.glory}
            </span>
          </div>
          {/* Prestige (T72) — END-GAME ONLY. Hidden until the last act is cleared; it
              gates NOTHING core (difficulty unlocks from the final boss, not this). */}
          {meta.prestigeUnlocked ? (
            <>
              <div className="flex items-center gap-1.5 border border-bleed/50 bg-pit/60 px-3 py-1">
                <span className="text-[10px] uppercase tracking-widest text-dust">Red Dust</span>
                <span className="text-base font-black tabular-nums text-bleed">
                  &#10070; {meta.redDust}
                </span>
              </div>
              <button
                onClick={() => setShowPrestige((v) => !v)}
                title="End-game prestige: sacrifice the tree for Red Dust + rule-breaking nodes"
                className={`rounded-sm border px-4 py-1.5 text-sm font-bold uppercase tracking-widest transition focus:outline-none ${
                  showPrestige
                    ? 'border-bleed bg-bleed/20 text-bleed'
                    : 'border-rust bg-umber/80 text-bone/80 hover:border-bleed hover:text-bleed'
                }`}
              >
                Prestige
              </button>
            </>
          ) : null}
          {import.meta.env.DEV ? (
            <button
              onClick={() => setRevealAll((v) => !v)}
              title="DEV: toggle full tree reveal vs the production step-by-step reveal"
              className={`rounded-sm border px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition focus:outline-none ${
                revealAll
                  ? 'border-toxic bg-toxic/15 text-toxic'
                  : 'border-rust bg-pit/60 text-bone/55 hover:border-toxic hover:text-toxic'
              }`}
            >
              {revealAll ? 'Reveal: All' : 'Reveal: Step'}
            </button>
          ) : null}
          <button
            disabled={spent <= 0}
            onClick={() => {
              if (confirmReset) {
                resetPermanents();
                setConfirmReset(false);
              } else {
                setConfirmReset(true);
              }
            }}
            onBlur={() => setConfirmReset(false)}
            title="Refund all spent Glory and clear the tree to rebuild"
            className={`rounded-sm border px-4 py-1.5 text-sm font-bold transition focus:outline-none disabled:opacity-30 ${
              confirmReset
                ? 'border-bleed bg-bleed/20 text-bleed'
                : 'border-rust bg-umber/80 text-bone/80 hover:border-bleed hover:text-bleed'
            }`}
          >
            {confirmReset ? `CONFIRM · REFUND ◆${spent}` : 'RESET'}
          </button>
          <button
            onClick={() => setMenuView('root')}
            className="rounded-sm border border-rust bg-umber/80 px-4 py-1.5 text-sm font-bold text-bone transition hover:border-gold hover:bg-iron/70 focus:border-gold focus:outline-none"
          >
            BACK
          </button>
        </div>
      </header>

      {/* Prestige panel (T72) — end-game replayability extension. Sacrifice the tree
          for Red Dust, spend it on rule-breaking nodes. Optional; never required. */}
      {showPrestige && meta.prestigeUnlocked ? (
        <div className="absolute inset-x-0 top-[3.4rem] z-20 mx-auto w-[44rem] max-w-[94vw] rounded-b-md border-2 border-bleed/50 bg-pit/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.7)]">
          <div className="mb-1 text-xs uppercase tracking-[0.4em] text-bleed">
            Prestige · End Game
          </div>
          <div className="mb-3 text-[11px] leading-tight text-bone/55">
            Sacrifice the entire Glory tree to mint <span className="text-bleed">Red Dust</span> —
            no Glory refund. Spend it on rule-breakers below, then rebuild deeper. Prestiged{' '}
            <span className="text-bone/80">{meta.prestigeCount}×</span>.
          </div>
          <button
            disabled={meta.prestigeReady <= 0}
            onClick={() => {
              if (confirmPrestige) {
                prestige();
                setConfirmPrestige(false);
              } else {
                setConfirmPrestige(true);
              }
            }}
            onBlur={() => setConfirmPrestige(false)}
            className={`mb-3 w-full rounded-sm border-2 px-4 py-2 text-sm font-black uppercase tracking-widest transition focus:outline-none disabled:opacity-30 ${
              confirmPrestige
                ? 'border-bleed bg-bleed/25 text-bleed'
                : 'border-bleed/70 bg-bleed/10 text-bleed hover:bg-bleed/20'
            }`}
          >
            {meta.prestigeReady <= 0
              ? 'Invest Glory first, then sacrifice'
              : confirmPrestige
                ? `CONFIRM — SACRIFICE TREE → +${meta.prestigeReady} ❖`
                : `SACRIFICE TREE → +${meta.prestigeReady} ❖ RED DUST`}
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            {meta.prestigeNodes.map((n) => (
              <button
                key={n.id}
                disabled={!n.affordable}
                onClick={() => buyPrestigeNode(n.id)}
                title={n.description}
                className={`flex flex-col gap-0.5 rounded-sm border px-3 py-2 text-left transition focus:outline-none disabled:cursor-default ${
                  n.owned >= n.maxLevel
                    ? 'border-bleed bg-bleed/15 text-bleed'
                    : n.affordable
                      ? 'border-bleed/60 bg-umber/80 text-bone hover:border-bleed'
                      : 'border-rust/40 bg-pit/60 text-bone/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-black">{n.name}</span>
                  <span className="text-[10px] tabular-nums text-bone/60">
                    {n.owned}/{n.maxLevel}
                  </span>
                </div>
                <div className="text-[10px] leading-tight text-bone/55">{n.description}</div>
                <div className="text-[10px] font-bold text-bleed">
                  {n.owned >= n.maxLevel ? 'MAX' : `❖ ${n.cost}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="relative flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
      >
        {/* Fixed-aspect inner layer — pan/zoom transform moves the whole tree so
            node %-coords never distort with the viewport size. */}
        <div
          ref={panRef}
          className="absolute left-1/2 top-1/2 h-[920px] w-[1140px] will-change-transform"
          style={{
            transform: `translate(-50%,-50%) translate(${view.x}px,${view.y}px) scale(${view.scale})`,
            transformOrigin: 'center',
          }}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="glory-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.1" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {TREE_ORBITS.map((o) => {
              const style = BRANCH_STYLE[o.branch];
              // Soft branch haze instead of a chunky dashed ring — a faint filled
              // ellipse reads as a region without a hard outline fighting the tree.
              return (
                <ellipse
                  key={`${o.branch}-${o.x}`}
                  cx={px(o.x)}
                  cy={o.y}
                  rx={o.r * COMPRESS * 0.96}
                  ry={o.r * 0.5}
                  fill={style.stroke}
                  opacity="0.05"
                />
              );
            })}
            {TREE_EDGES.map(([a, b]) => {
              const aVis = a === 'root' || nodeVisible(a);
              const bVis = nodeVisible(b);
              if (!aVis && !bVis) return null; // both past the veil → draw nothing
              const from = proj(TREE_NODES[a]!);
              const to = proj(TREE_NODES[b]!);
              const style = BRANCH_STYLE[TREE_NODES[b]!.branch];
              // HINT stub: the child is hidden (beyond the mystery layer) → trail a
              // faint dotted connector partway toward it and let it fade into the
              // dark, suggesting "there's more out here" without revealing the shape.
              if (aVis && !bVis) {
                const hx = from.x + (to.x - from.x) * 0.4;
                const hy = from.y + (to.y - from.y) * 0.4;
                return (
                  <path
                    key={`${a}-${b}`}
                    d={`M ${from.x} ${from.y} L ${hx} ${hy}`}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth={0.3}
                    opacity={0.13}
                    strokeLinecap="round"
                    strokeDasharray="0.8 1.8"
                  />
                );
              }
              const open = ownedOf(a) > 0; // prerequisite met → branch edge is "live"
              const lit = hovered === a || hovered === b;
              return (
                <g key={`${a}-${b}`}>
                  <path
                    d={branchPath(from, to)}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth={lit ? 1.1 : 1.4}
                    opacity={open ? (lit ? 0.3 : 0.12) : 0.05}
                    strokeLinecap="round"
                    // Blur is EXPENSIVE — apply the feGaussianBlur halo only to the
                    // one lit edge. Idle edges fake the glow with a wider, softer
                    // translucent stroke (no filter), so a hover doesn't re-raster
                    // 38 blurred paths.
                    filter={lit ? 'url(#glory-glow)' : undefined}
                  />
                  <path
                    d={branchPath(from, to)}
                    fill="none"
                    stroke={open ? style.stroke : '#5b4a3a'}
                    strokeWidth={lit ? 0.5 : 0.38}
                    opacity={open ? (lit ? 1 : 0.85) : 0.4}
                    strokeLinecap="round"
                    strokeDasharray={open ? undefined : '1.5 1.5'}
                  />
                </g>
              );
            })}
          </svg>

          <div
            className="absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-cyan bg-pit text-lg text-cyan shadow-[0_0_30px_rgba(50,215,255,0.38)]"
            style={{ left: `${px(TREE_NODES.root!.x)}%`, top: `${TREE_NODES.root!.y}%` }}
          >
            {TREE_NODES.root!.icon}
          </div>

          {meta.permanents.map((p) => {
            if (!isTreeNodeId(p.id)) return null;
            // Fog of war: don't render nodes deeper than the mystery layer — beyond
            // the frontier the tree is only HINTED by fading connectors (below).
            if (!nodeVisible(p.id)) return null;
            const node = TREE_NODES[p.id]!;
            const maxed = p.owned >= p.maxLevel;
            const owned = p.owned > 0;
            const reachable = isUnlocked(p.id);
            // Boss-gated node not yet unlocked (T47/V25): tree-reachable but locked
            // behind a boss kill / mastery — reads LOCKED, not just unaffordable.
            const bossLocked = p.locked === true;
            // Can BUY the next level right now (new node OR an owned one with room).
            const buyable = reachable && p.affordable && !maxed && !bossLocked;
            // Reachable + has a next level but you CAN'T afford it (new OR partly-owned).
            const needGlory = reachable && !maxed && !bossLocked && !p.affordable;
            const rarity = p.rarity;
            // Show the icon one step past the frontier (and always for keystones)
            // so the player can plan a route; deeper locked nodes stay a ⊘ mystery.
            // Production: frontier step-by-step reveal (far ends stay a ⊘ mystery,
            // including deep legendaries — preserve the surprise). Dev: reveal all.
            const revealed = iconRevealed(p.id);
            // Legendary keystones recolour to ORANGE; everything else takes its
            // branch colour (red / green / blue).
            const style = rarity === 'legendary' ? LEGENDARY_STYLE : BRANCH_STYLE[node.branch];
            // Rarity drives node SIZE + framing so the tree reads at a glance:
            //  • common     → standard disc
            //  • rare       → larger disc, double inset ring (a "mechanic" node)
            //  • legendary  → biggest, hex-cut feel + permanent glow (a KEYSTONE)
            const sizeClass =
              rarity === 'legendary'
                ? 'h-[2.9rem] w-[2.9rem] text-lg'
                : rarity === 'rare'
                  ? 'h-[2.4rem] w-[2.4rem] text-sm'
                  : 'h-[1.9rem] w-[1.9rem] text-xs';
            // Rarity rim: rare gets an inner ring, legendary an animated outer glow
            // (only once owned/buyable — locked legendaries stay quiet).
            const rarityRim =
              rarity === 'legendary'
                ? reachable
                  ? 'ring-2 ring-legendary/45 shadow-[0_0_34px_rgba(255,140,26,0.42),inset_0_0_0_1px_rgba(7,5,4,0.9)]'
                  : ''
                : rarity === 'rare'
                  ? 'ring-1 ring-bone/25'
                  : '';
            // Distinct node states (readability pass). "Can't afford" always reads as
            // an AMBER rim so the player learns one cue for "need more Glory":
            //  • locked (prereq missing)   → grey, dashed, faint, ⊘
            //  • boss-gated                → gold dashed 🔒
            //  • maxed (completed)         → gold filled, ★ badge
            //  • owned + can upgrade now   → solid branch + ring, PULSING (buy ready)
            //  • owned + can't afford more → solid branch, DIMMED + amber rim (save up)
            //  • new + affordable          → branch outline, PULSING
            //  • new + can't afford        → faint branch, AMBER rim + ◈cost (save up)
            const AMBER_RIM =
              'shadow-[0_0_0_1.5px_rgba(255,176,52,0.75),0_0_14px_rgba(255,176,52,0.3)]';
            const stateClass = !reachable
              ? 'border-dashed border-bone/12 bg-pit/85 text-bone/15 opacity-45 saturate-0'
              : bossLocked
                ? 'border-dashed border-gold/35 bg-pit/85 text-gold/40 opacity-70 saturate-50'
                : maxed
                  ? 'border-gold bg-[radial-gradient(circle_at_35%_30%,rgba(255,210,63,0.28),rgba(7,5,4,0.92)_62%)] text-gold shadow-[0_0_26px_rgba(255,210,63,0.4)]'
                  : owned
                    ? buyable
                      ? `${style.border} ${style.text} ${style.ring} bg-pit ring-2 animate-pulse`
                      : `${style.border} ${style.text} bg-pit opacity-75 saturate-50 ${AMBER_RIM}`
                    : buyable
                      ? `${style.border} ${style.text} ring-2 ring-offset-0 animate-pulse`
                      : `border-ember/40 bg-pit text-ember/80 ${AMBER_RIM}`;
            return (
              <button
                key={p.id}
                title={bossLocked ? p.lockLabel : undefined}
                onClick={() => buyable && buy(p.id)}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={() => !drag.current && setHovered(p.id as TreeNodeId)}
                onMouseLeave={() => !drag.current && setHovered((h) => (h === p.id ? null : h))}
                onFocus={() => setHovered(p.id as TreeNodeId)}
                className={`absolute flex ${sizeClass} -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 shadow-[inset_0_0_0_1px_rgba(7,5,4,0.9),0_12px_32px_rgba(0,0,0,0.5)] transition hover:scale-110 ${stateClass} ${rarityRim} ${hovered === p.id ? 'z-10 scale-110 ring-2 ring-bone/80' : ''} ${buyable ? 'cursor-pointer' : 'cursor-default'}`}
                style={{ left: `${px(node.x)}%`, top: `${node.y}%` }}
              >
                {/* Always keep the node icon visible — the maxed ★ rides a corner
                    badge, it never covers the glyph (only locked hides it). */}
                {bossLocked ? '🔒' : revealed ? node.icon : '⊘'}
                {/* TOP-LEFT: maxed ★, else a small n/max level pip for any owned node
                    (so a partly-levelled node ALWAYS shows its progress, even when the
                    next level is unaffordable). */}
                {maxed ? (
                  <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-gold bg-pit text-[11px] leading-none text-gold shadow-[0_0_10px_rgba(255,210,63,0.5)]">
                    ★
                  </span>
                ) : owned && revealed ? (
                  <span className="absolute -left-1.5 -top-1.5 rounded-full border border-rust bg-umber px-1 text-[8px] font-bold leading-tight text-bone">
                    {p.owned}/{p.maxLevel}
                  </span>
                ) : null}
                {/* BOTTOM-RIGHT: the next-level price when you can't afford it. */}
                {revealed && needGlory ? (
                  <span className="absolute -bottom-2 -right-2 rounded-full border border-ember/70 bg-pit px-1.5 py-0.5 text-[10px] font-bold text-ember">
                    ◈{p.cost}
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* Tooltip anchored NEXT TO the hovered node (counter-scaled so it stays
              readable at any zoom). Flips side near the right edge. */}
          {hoveredP && hovered ? (
            <div
              className="pointer-events-none absolute z-20"
              style={{
                left: `${px(TREE_NODES[hovered]!.x)}%`,
                top: `${TREE_NODES[hovered]!.y}%`,
                transform: `translate(${px(TREE_NODES[hovered]!.x) > 55 ? 'calc(-100% - 30px)' : '30px'}, -50%) scale(${1 / view.scale})`,
                transformOrigin: px(TREE_NODES[hovered]!.x) > 55 ? 'right center' : 'left center',
              }}
            >
              <div
                className={`w-64 border bg-pit/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)] ${hoveredRevealed ? BRANCH_STYLE[hoveredBranch].border : 'border-bone/20'}`}
              >
                {hoveredRevealed ? (
                  <PermanentTooltipBody
                    permanent={hoveredP}
                    action={
                      hoveredLocked
                        ? `Locked — buy ${hoveredParent ? (byId.get(hoveredParent)?.name ?? 'the prior node') : 'the prior node'} first`
                        : hoveredP.owned >= hoveredP.maxLevel
                          ? 'MAXED'
                          : hoveredP.affordable
                            ? `Click to buy — ${hoveredP.cost} ◆`
                            : `Costs ${hoveredP.cost} ◆ (insufficient)`
                    }
                  />
                ) : (
                  <>
                    <div className="text-sm font-black uppercase tracking-widest text-bone/55">
                      ⊘ Unknown
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-bone/55">
                      A sealed contract. Advance along this branch to reveal what it holds.
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Zoom / reset controls (don't start a pan) */}
        <div
          className="absolute right-3 top-3 flex items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(
            [
              ['−', () => setView((v) => ({ ...v, scale: clampScale(v.scale - 0.2) }))],
              ['＋', () => setView((v) => ({ ...v, scale: clampScale(v.scale + 0.2) }))],
              ['⟳', reset],
            ] as const
          ).map(([label, fn]) => (
            <button
              key={label}
              onClick={fn}
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-rust bg-pit/80 text-sm text-bone/70 transition hover:border-gold hover:text-gold focus:outline-none"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Controls hint + legend for the node states. */}
        <div className="pointer-events-none absolute bottom-3 left-4 flex flex-col gap-1 text-[10px] uppercase tracking-widest text-bone/40">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan" /> allocated
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-gold ring-1 ring-gold" />{' '}
              maxed
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-cyan" />{' '}
              reachable
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-bone/25" />{' '}
              locked
            </span>
          </div>
          <div>hover a node for details · drag to pan · scroll to zoom · esc to exit</div>
        </div>
      </div>
    </div>
  );
}
