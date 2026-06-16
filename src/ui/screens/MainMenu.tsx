// Main menu (T27, §13.4). Opens over the rendered empty arena; options read as
// arena signage. Lilu Tubs is the only warrior in the slice; Arsenal/Glory Tree/
// Challenges are coherent "coming soon" placeholders (rule 14, ⊥ broken). Records
// + Settings are live from the saved profile.

import { useEffect, useRef, useState } from 'react';
import { useUiStore, type MenuView } from '../store';
import { SocialFooter } from '../SocialFooter';
import { WEAPONS } from '../../content/weapons/index';
import { PERMANENT_UPGRADES } from '../../content/permanent/index';
import { ARENAS, type ArenaId } from '../../sim/arena';

const PRIMARY_ITEM = { label: 'Enter the Pit', sub: 'Begin a run' };

const ITEMS: { view: MenuView; label: string; sub: string }[] = [
  { view: 'warrior', label: 'Warrior', sub: 'Choose your fighter' },
  { view: 'arsenal', label: 'Arsenal', sub: 'Weapon rack' },
  { view: 'glory', label: 'Glory Tree', sub: 'Permanent upgrades' },
  { view: 'challenges', label: 'Challenges', sub: 'Modifiers & seeds' },
  { view: 'records', label: 'Records', sub: 'Your best runs' },
  { view: 'settings', label: 'Settings', sub: 'Audio & options' },
];

function MenuBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 overflow-y-auto bg-pit/72 px-4 py-6 font-mono text-bone backdrop-blur-[3px]">
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,5,4,0.35),rgba(7,5,4,0.15)_45%,rgba(7,5,4,0.55))]" />
      <div className="relative z-10 min-h-full">{children}</div>
    </div>
  );
}

function Frame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`border-2 border-rust/80 bg-pit/82 shadow-[0_24px_80px_rgba(0,0,0,0.62),inset_0_0_0_1px_rgba(240,200,121,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase text-gold">{children}</div>;
}

function LogoLockup() {
  return (
    <div className="relative w-full text-center">
      <div className="mx-auto mb-2 flex h-6 w-64 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-px w-10 bg-cyan shadow-[0_0_14px_rgba(50,215,255,0.85)]" />
          <span className="h-2.5 w-2.5 border border-cyan bg-pit shadow-[0_0_16px_rgba(50,215,255,0.75)]" />
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 border border-elite bg-pit shadow-[0_0_16px_rgba(216,76,255,0.65)]" />
          <span className="h-px w-10 bg-elite shadow-[0_0_14px_rgba(216,76,255,0.75)]" />
        </div>
      </div>
      <h1 className="mx-auto w-fit border-b-4 border-gold bg-pit/88 px-8 py-2 text-5xl font-black text-bone shadow-[0_18px_64px_rgba(0,0,0,0.72),inset_0_0_0_1px_rgba(240,200,121,0.16)] drop-shadow-[0_0_18px_rgba(196,106,43,0.42)] md:text-7xl">
        <span className="text-gold">MARS</span>
        <span className="ml-[0.16em] text-bone">INC</span>
      </h1>
      <div className="mx-auto mt-3 flex w-40 items-center gap-2">
        <div className="h-1 flex-1 bg-gold" />
        <div className="h-1 w-8 bg-cyan" />
        <div className="h-1 flex-1 bg-bleed" />
      </div>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-bone/78">
        Arena entry terminal. Select a contract, survive the broadcast, invoice the survivors.
      </p>
    </div>
  );
}

function MenuShell({ children }: { children: React.ReactNode }) {
  return (
    <MenuBackdrop>
      <div className="flex min-h-full items-center justify-center">
        <div className="flex w-[42rem] max-w-full flex-col items-center gap-4">
          <LogoLockup />
          {children}
        </div>
      </div>
    </MenuBackdrop>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const setMenuView = useUiStore((s) => s.setMenuView);
  return (
    <MenuShell>
      <Frame className="w-full p-5 md:p-7">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-rust/70 pb-3">
          <div>
            <Eyebrow>Mars Inc terminal</Eyebrow>
            <div className="text-2xl font-black text-bone">{title}</div>
          </div>
          <button
            onClick={() => setMenuView('root')}
            className="shrink-0 rounded-sm border border-rust bg-umber/80 px-4 py-2 text-sm font-bold text-bone transition hover:border-gold hover:bg-iron/70 focus:border-gold focus:outline-none"
          >
            BACK
          </button>
        </div>
        {children}
      </Frame>
    </MenuShell>
  );
}

function WarriorPanel() {
  return (
    <Panel title="WARRIOR">
      <div className="rounded-md border-2 border-gold bg-umber/85 p-6 shadow-[inset_0_0_0_1px_rgba(7,5,4,0.8)]">
        <div className="text-xl font-black text-bone">Lilu Tubs</div>
        <div className="mb-3 text-xs uppercase tracking-widest text-dust">Human Scrapper</div>
        <ul className="space-y-1 text-sm text-bone/80">
          <li>• Balanced movement &amp; durability</li>
          <li>• Starts with the Contractual Sidearm</li>
          <li>• Sprint reloads weapon cooldowns (planned)</li>
          <li>• Nearby scrap grants firing speed (planned)</li>
        </ul>
        <div className="mt-4 text-xs text-cyan">Selected — more warriors unlock later.</div>
      </div>
    </Panel>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ComboRecords({
  rows,
}: {
  rows: {
    id: string;
    arena: string;
    character: string;
    bestTimeSec: number;
    bestLevel: number;
    mostKills: number;
  }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-gold">
        Best by arena × character
      </div>
      <div className="overflow-hidden rounded-md border border-rust/70 bg-umber/60">
        <div className="grid grid-cols-[1.3fr_1fr_auto_auto_auto] gap-x-4 border-b border-rust/40 px-4 py-1.5 text-[10px] uppercase tracking-widest text-dust">
          <span>Arena</span>
          <span>Fighter</span>
          <span className="text-right">Best time</span>
          <span className="text-right">Lvl</span>
          <span className="text-right">Kills</span>
        </div>
        {rows.map((r) => {
          const played = r.bestTimeSec > 0 || r.bestLevel > 0 || r.mostKills > 0;
          return (
            <div
              key={r.id}
              className="grid grid-cols-[1.3fr_1fr_auto_auto_auto] gap-x-4 border-b border-rust/20 px-4 py-2 text-sm last:border-0"
            >
              <span className="font-bold text-bone">{r.arena}</span>
              <span className="text-bone/80">{r.character}</span>
              {played ? (
                <>
                  <span className="text-right tabular-nums text-bone/85">
                    {fmtTime(r.bestTimeSec)}
                  </span>
                  <span className="text-right tabular-nums text-bone/85">{r.bestLevel}</span>
                  <span className="text-right tabular-nums text-bone/85">{r.mostKills}</span>
                </>
              ) : (
                <span className="col-span-3 text-right text-xs text-dust">no runs yet</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecordsPanel() {
  const p = useUiStore((s) => s.profile);
  return (
    <Panel title="RECORDS">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          ['Best time', fmtTime(p.bestTimeSec)],
          ['Best level', `${p.bestLevel}`],
          ['Most kills', `${p.mostKills}`],
          ['Runs played', `${p.runCount}`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-rust/70 bg-umber/80 p-4 text-center shadow-[inset_0_0_0_1px_rgba(7,5,4,0.7)]"
          >
            <div className="text-[10px] uppercase tracking-widest text-dust">{label}</div>
            <div className="text-2xl font-bold text-bone tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <ComboRecords rows={p.byCombo} />
    </Panel>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 border-b border-rust/30 py-2.5 text-sm text-bone last:border-0">
      <span className="tracking-widest">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <span className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-56 accent-gold"
      />
      <span className="w-12 text-right tabular-nums text-bone/70">{Math.round(value * 100)}</span>
    </span>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`flex h-6 w-12 items-center rounded-full border transition ${
        on ? 'border-gold bg-gold/30' : 'border-rust bg-pit/60'
      }`}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-bone transition ${on ? 'translate-x-6' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

// Reusable settings rows — shared by the menu Settings panel and the in-game
// pause menu so both edit the same persisted slice via `applySetting`.
export function SettingsControls() {
  const s = useUiStore((st) => st.settings);
  const set = useUiStore((st) => st.applySetting);
  return (
    <div className="rounded-md border border-rust/70 bg-umber/80 px-6 py-3">
      <SettingRow label="ARENA">
        <span className="flex gap-1.5">
          {(
            [
              ['cold-vault', 'Cold Vault', '#32d7ff'],
              ['rust-crown', 'Rust Crown', '#f0c879'],
            ] as const
          ).map(([id, label, color]) => (
            <button
              key={id}
              onClick={() => set({ arenaId: id })}
              className={`rounded-sm border px-2.5 py-1 text-xs font-bold tracking-wide transition focus:outline-none ${
                s.arenaId === id
                  ? 'bg-pit/70 text-bone'
                  : 'border-rust/60 bg-pit/40 text-bone/55 hover:text-bone'
              }`}
              style={s.arenaId === id ? { borderColor: color, color } : undefined}
            >
              {label}
            </button>
          ))}
        </span>
      </SettingRow>
      <SettingRow label="MASTER VOLUME">
        <Slider value={s.masterVolume} onChange={(v) => set({ masterVolume: v })} />
      </SettingRow>
      <SettingRow label="SFX VOLUME">
        <Slider value={s.sfxVolume} onChange={(v) => set({ sfxVolume: v })} />
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
    </div>
  );
}

function SettingsPanel() {
  return (
    <Panel title="SETTINGS">
      <SettingsControls />
      <div className="mt-3 text-xs text-bone/40">
        Key rebinding, controller, and colorblind palettes land in a later pass.
      </div>
    </Panel>
  );
}

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
  const n = BRANCH_ORDER.length;
  // The canvas is 1140×920 (x-units ~1.24× wider than y on screen), so COMPRESS x to
  // keep the radial star round instead of flattening the diagonal spokes.
  const XS = 0.81;
  const SECTOR = ((2 * Math.PI) / n) * 0.86; // angular width each branch owns (gap between)
  const R0 = 15; // depth-0 node distance from the hub
  const RSTEP = 12; // radial gap per tree depth
  BRANCH_ORDER.forEach((branch, bi) => {
    const center = -Math.PI / 2 + (bi * 2 * Math.PI) / n; // spoke direction
    const all = PERMANENT_UPGRADES.filter((u) => u.branch === branch)
      .slice()
      .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
    // Don't let the legendaries pile up at the deepest tips (pure cost order does
    // that). Cheap commons stay near the hub; splice legendaries into mid-outer
    // positions so they become INTERNAL milestones — you path THROUGH a keystone to
    // reach the nodes beyond it, and they sit spread along each branch, not all out
    // at the rim.
    const legs = all.filter((u) => u.rarity === 'legendary');
    const nodes = all.filter((u) => u.rarity !== 'legendary');
    legs.forEach((lg, i) => {
      const frac = legs.length === 1 ? 0.55 : 0.4 + 0.42 * (i / (legs.length - 1));
      const pos = Math.min(nodes.length, Math.max(2, Math.round(nodes.length * frac)));
      nodes.splice(pos, 0, lg);
    });
    const count = nodes.length;
    if (count === 0) return;
    // Cost-ordered BINARY tree (heap layout): node k's children are 2k+1 / 2k+2, so a
    // branch FORKS into sub-branches as it grows. Lay it out tidily — each subtree
    // gets an angular wedge sized by its leaf count, so siblings never overlap.
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
    let maxDepth = 0;
    const place = (k: number, a0: number, a1: number, depth: number) => {
      if (depth > maxDepth) maxDepth = depth;
      const a = (a0 + a1) / 2; // node sits at the centre of its wedge
      const radius = R0 + depth * RSTEP;
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
      let cur = a0;
      for (const c of ch) {
        const span = (a1 - a0) * (leaves[c]! / total);
        place(c, cur, cur + span, depth + 1);
        cur += span;
      }
    };
    place(0, center - SECTOR / 2, center + SECTOR / 2, 0);
    const midR = R0 + (maxDepth * RSTEP) / 2;
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
  const bow = Math.min(7, len * 0.16);
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

function GloryTree() {
  const meta = useUiStore((s) => s.meta);
  const buy = useUiStore((s) => s.buyPermanent);
  const setMenuView = useUiStore((s) => s.setMenuView);
  const resetPermanents = useUiStore((s) => s.resetPermanents);

  const [confirmReset, setConfirmReset] = useState(false);
  // Dev affordance: reveal the WHOLE tree to study it. Off (production) reveals
  // step-by-step from the frontier, so first-time players don't see the far ends.
  // Defaults ON in dev builds, hidden + off in production.
  const [revealAll, setRevealAll] = useState(import.meta.env.DEV);
  const spent = meta.permanents.reduce((s, p) => s + p.cost * p.owned, 0);
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
  // Planning lookahead: a node's icon is REVEALED if it's buyable now OR sits one
  // step past a buyable node (its parent is itself unlocked) — so you can see a bit
  // further than the immediate frontier and route your Glory. Deeper nodes stay a
  // ⊘ mystery until you advance. (Legendary keystones reveal regardless — they're
  // the goals you build toward.)
  const isRevealed = (id: TreeNodeId): boolean => {
    if (isUnlocked(id)) return true;
    const parent = TREE_PARENT[id];
    return parent !== undefined && isUnlocked(parent);
  };
  // Dev "Reveal: All" overrides the frontier reveal. A node that is NOT revealed
  // stays a true mystery — its identity, cost, and tooltip are all hidden.
  const nodeRevealed = (id: TreeNodeId): boolean => revealAll || isRevealed(id);
  const hoveredRevealed = hovered ? nodeRevealed(hovered) : false;
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
      <header className="flex shrink-0 items-center gap-4 border-b border-rust/60 bg-pit/70 px-5 py-2">
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
              const from = proj(TREE_NODES[a]!);
              const to = proj(TREE_NODES[b]!);
              const style = BRANCH_STYLE[TREE_NODES[b]!.branch];
              const open = ownedOf(a) > 0; // prerequisite met → branch edge is "live"
              const lit = hovered === a || hovered === b;
              return (
                <g key={`${a}-${b}`}>
                  <path
                    d={branchPath(from, to)}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth={lit ? 2.8 : 3.4}
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
                    strokeWidth={lit ? 1.1 : 0.85}
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
            const node = TREE_NODES[p.id]!;
            const maxed = p.owned >= p.maxLevel;
            const owned = p.owned > 0;
            const reachable = isUnlocked(p.id);
            const buyable = reachable && p.affordable && !maxed;
            // Unlocked + available to buy, but you can't afford it right now.
            const pricedOut = reachable && !maxed && !owned && !p.affordable;
            const rarity = p.rarity;
            // Show the icon one step past the frontier (and always for keystones)
            // so the player can plan a route; deeper locked nodes stay a ⊘ mystery.
            // Production: frontier step-by-step reveal (far ends stay a ⊘ mystery,
            // including deep legendaries — preserve the surprise). Dev: reveal all.
            const revealed = nodeRevealed(p.id);
            // Legendary keystones recolour to ORANGE; everything else takes its
            // branch colour (red / green / blue).
            const style = rarity === 'legendary' ? LEGENDARY_STYLE : BRANCH_STYLE[node.branch];
            // Rarity drives node SIZE + framing so the tree reads at a glance:
            //  • common     → standard disc
            //  • rare       → larger disc, double inset ring (a "mechanic" node)
            //  • legendary  → biggest, hex-cut feel + permanent glow (a KEYSTONE)
            const sizeClass =
              rarity === 'legendary'
                ? 'h-[3.3rem] w-[3.3rem] text-xl'
                : rarity === 'rare'
                  ? 'h-[2.7rem] w-[2.7rem] text-base'
                  : 'h-[2.2rem] w-[2.2rem] text-sm';
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
            // Five clearly distinct states:
            //  • maxed (completed)        → gold ring + filled, gold ★ badge
            //  • allocated (owned, < max) → solid branch colour + glow ring
            //  • buyable (afford next)    → branch outline, pulsing
            //  • PRICED OUT (afford fail) → solid branch ring + RED "needs glory" glow + ◈cost
            //  • locked (prereq missing)  → grey, dashed, ⊘
            const stateClass = !reachable
              ? 'border-dashed border-bone/15 bg-pit/80 text-bone/20 opacity-60'
              : maxed
                ? 'border-gold bg-[radial-gradient(circle_at_35%_30%,rgba(255,210,63,0.28),rgba(7,5,4,0.92)_62%)] text-gold shadow-[0_0_26px_rgba(255,210,63,0.4)]'
                : owned
                  ? `${style.border} ${style.text} ${style.ring} bg-pit`
                  : buyable
                    ? `${style.border} ${style.text} ring-2 ring-offset-0 animate-pulse`
                    : `${style.border} text-bone/55 saturate-50 bg-[radial-gradient(circle_at_50%_50%,rgba(255,59,48,0.16),rgba(7,5,4,0.92)_68%)] shadow-[0_0_0_1px_rgba(255,59,48,0.35),0_0_18px_rgba(255,59,48,0.22)]`;
            return (
              <button
                key={p.id}
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
                {revealed ? node.icon : '⊘'}
                {maxed ? (
                  <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-gold bg-pit text-[11px] leading-none text-gold shadow-[0_0_10px_rgba(255,210,63,0.5)]">
                    ★
                  </span>
                ) : null}
                {revealed ? (
                  <span
                    className={`absolute -bottom-2 -right-2 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
                      maxed
                        ? 'border-gold bg-gold text-pit'
                        : pricedOut
                          ? 'border-bleed bg-pit text-bleed'
                          : 'border-rust bg-umber text-bone'
                    }`}
                  >
                    {maxed ? 'MAX' : pricedOut ? `◈${p.cost}` : `${p.owned}/${p.maxLevel}`}
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
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-black uppercase ${BRANCH_STYLE[hoveredBranch].text}`}
                      >
                        {hoveredP.name}
                      </span>
                      <span className="shrink-0 text-xs text-bone/70">
                        {hoveredP.owned}/{hoveredP.maxLevel}
                      </span>
                    </div>
                    <div
                      className={`mt-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${
                        hoveredP.rarity === 'legendary'
                          ? 'text-legendary'
                          : hoveredP.rarity === 'rare'
                            ? 'text-bone/70'
                            : 'text-bone/40'
                      }`}
                    >
                      {hoveredP.rarity === 'legendary'
                        ? '◆ Keystone'
                        : hoveredP.rarity === 'rare'
                          ? '◈ Rare'
                          : 'Common'}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-bone/75">
                      {hoveredP.description}
                    </div>
                    <div className="mt-2 text-[11px] font-bold text-gold">
                      {hoveredLocked
                        ? `Locked — buy ${hoveredParent ? (byId.get(hoveredParent)?.name ?? 'the prior node') : 'the prior node'} first`
                        : hoveredP.owned >= hoveredP.maxLevel
                          ? 'MAXED'
                          : hoveredP.affordable
                            ? `Click to buy — ${hoveredP.cost} ◆`
                            : `Costs ${hoveredP.cost} ◆ (insufficient)`}
                    </div>
                  </>
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

function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <Panel title={title}>
      <div className="rounded-md border border-dashed border-rust/80 bg-umber/75 p-8 text-center">
        <div className="text-lg text-bone/80">{blurb}</div>
        <div className="mt-2 text-xs uppercase tracking-widest text-dust">Coming soon</div>
      </div>
    </Panel>
  );
}

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

function ArsenalPanel() {
  return (
    <Panel title="ARSENAL">
      <div className="mb-3 text-xs text-bone/60">
        Every weapon trades power for a cost — no single gun wins. Weapons drop in-run; permanent
        unlocks &amp; loadout selection are coming with the boss-gated weapon families.
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {WEAPONS.map((w) => {
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex justify-between">
      <span className="text-dust">{label}</span>
      <span className="tabular-nums text-bone/85">{value}</span>
    </span>
  );
}

function CreditsPanel() {
  return (
    <Panel title="CREDITS">
      <div className="space-y-2 text-center text-sm text-bone/80">
        <div className="text-base text-bone">MARS PIT</div>
        <div>A fixed-arena survivors-like, built in the open.</div>
        <div className="text-bone/50">Three.js · WebGPU · React · Tailwind</div>
      </div>
    </Panel>
  );
}

/** Act selector — the arena IS the difficulty/Act picker (T-Act). Act 1 = Cold
 *  Vault (blue, standard); Act 2 = Rust Crown (orange, harder, more Glory). Writes
 *  through applySetting so the live arena rebuilds behind the menu. */
function ActSelector() {
  const arenaId = useUiStore((s) => s.settings.arenaId);
  const set = useUiStore((s) => s.applySetting);
  // Act 2+ stays a ??? mystery until the Gatekeeper falls once — the growth gate.
  const bossDefeated = useUiStore((s) => s.profile.bossDefeated);
  const acts = (Object.keys(ARENAS) as ArenaId[])
    .map((id) => ARENAS[id])
    .sort((a, b) => a.act - b.act);
  return (
    <div className="mb-3">
      <div className="mb-1.5 px-1 text-[11px] uppercase tracking-widest text-dust">Select Act</div>
      <div className="grid grid-cols-2 gap-1.5">
        {acts.map((a) => {
          const locked = a.act > 1 && !bossDefeated;
          const selected = arenaId === a.id && !locked;
          if (locked) {
            return (
              <div
                key={a.id}
                className="rounded-sm border-2 border-dashed border-rust/45 bg-pit/55 px-3 py-2.5 text-left opacity-80"
                title="Defeat the Gatekeeper in Act 1 to unlock"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-bone/40">
                    Act {a.act}
                  </span>
                  <span className="shrink-0 text-[10px] text-bone/40">🔒 Locked</span>
                </div>
                <div className="text-sm font-black text-bone/45">??? ? ? ???</div>
                <div className="mt-0.5 text-[11px] leading-tight text-bone/40">
                  Fell the Gatekeeper in Act 1 to unlock the next contract.
                </div>
              </div>
            );
          }
          return (
            <button
              key={a.id}
              onClick={() => set({ arenaId: a.id as ArenaId })}
              className={`rounded-sm border-2 px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(7,5,4,0.7)] transition focus:outline-none ${
                selected ? 'bg-umber/85' : 'border-rust/55 bg-pit/45 hover:border-bone/40'
              }`}
              style={selected ? { borderColor: a.accent } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-black uppercase tracking-wider"
                  style={{ color: a.accent }}
                >
                  Act {a.act}
                </span>
                {a.gloryMult > 1 ? (
                  <span className="shrink-0 text-[10px] font-bold text-gold">
                    +{Math.round((a.gloryMult - 1) * 100)}% ◆
                  </span>
                ) : null}
              </div>
              <div className="text-sm font-black text-bone">{a.name}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-bone/60">{a.tagline}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-bone/45">
                {a.difficultyMult > 1 ? (
                  <span className="text-bleed/80">Tougher hosts ×{a.difficultyMult}</span>
                ) : (
                  'Baseline difficulty'
                )}
                {selected ? <span className="ml-1 text-bone/70">· selected</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Root() {
  const setMenuView = useUiStore((s) => s.setMenuView);
  const enterPit = useUiStore((s) => s.enterPit);
  return (
    <MenuShell>
      <Frame className="w-full p-3.5">
        <div className="mb-3 flex items-center justify-between border-b border-rust/70 px-2 pb-2 text-xs uppercase text-dust">
          <span>Liability waiver armed</span>
          <span>Broadcast gate open</span>
        </div>

        <button
          onClick={enterPit}
          className="group mb-3 flex w-full items-center justify-between rounded-sm border-2 border-gold bg-[linear-gradient(135deg,rgba(255,210,63,0.35),rgba(196,106,43,0.42)_45%,rgba(255,59,48,0.28))] px-5 py-4 text-left shadow-[0_14px_40px_rgba(196,106,43,0.18),inset_0_0_0_1px_rgba(7,5,4,0.75)] transition hover:border-cyan hover:bg-[linear-gradient(135deg,rgba(50,215,255,0.34),rgba(216,76,255,0.25)_48%,rgba(255,210,63,0.38))] hover:shadow-[0_16px_46px_rgba(50,215,255,0.22),inset_0_0_0_1px_rgba(7,5,4,0.75)] focus:border-cyan focus:outline-none"
        >
          <span className="min-w-0">
            <span className="block text-2xl font-black text-bone">{PRIMARY_ITEM.label}</span>
            <span className="mt-1 block text-sm text-bone/82">{PRIMARY_ITEM.sub}</span>
          </span>
          <span className="ml-4 shrink-0 border border-pit/80 bg-pit/70 px-3 py-1 text-sm font-black text-gold transition group-hover:text-cyan">
            START
          </span>
        </button>

        <ActSelector />

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {ITEMS.map((it) => (
            <button
              key={it.view}
              onClick={() => setMenuView(it.view)}
              className="group flex min-h-16 items-center justify-between rounded-sm border border-rust/85 bg-umber/82 px-3.5 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(7,5,4,0.75)] transition hover:border-cyan hover:bg-[linear-gradient(135deg,rgba(143,63,36,0.68),rgba(50,215,255,0.14))] focus:border-gold focus:outline-none"
            >
              <span className="min-w-0">
                <span className="block text-sm font-black text-bone md:text-base">{it.label}</span>
                <span className="mt-0.5 block text-xs text-bone/62 group-hover:text-bone/88">
                  {it.sub}
                </span>
              </span>
              <span className="ml-3 shrink-0 text-xl text-rust transition group-hover:text-cyan">
                ▸
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end border-t border-rust/50 pt-3">
          <button
            onClick={() => setMenuView('credits')}
            className="rounded-sm border border-rust/70 bg-pit/60 px-3 py-1.5 text-xs uppercase text-bone/60 transition hover:border-gold hover:text-gold focus:border-gold focus:outline-none"
          >
            Credits
          </button>
        </div>
      </Frame>
    </MenuShell>
  );
}

function ActiveMenu() {
  const view = useUiStore((s) => s.menuView);
  switch (view) {
    case 'warrior':
      return <WarriorPanel />;
    case 'records':
      return <RecordsPanel />;
    case 'settings':
      return <SettingsPanel />;
    case 'credits':
      return <CreditsPanel />;
    case 'arsenal':
      return <ArsenalPanel />;
    case 'glory':
      return <GloryTree />;
    case 'challenges':
      return <ComingSoon title="CHALLENGES" blurb="Daily seeds, redline mode, boss rush." />;
    case 'root':
      return <Root />;
  }
}

export function MainMenu() {
  // Socials pinned to the viewport on EVERY menu view (not just the root screen).
  return (
    <>
      <ActiveMenu />
      <SocialFooter className="fixed inset-x-0 bottom-3 z-20 short:bottom-1" />
    </>
  );
}
