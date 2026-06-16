// Main menu (T27, §13.4). Opens over the rendered empty arena; options read as
// arena signage. Lilu Tubs is the only warrior in the slice; Arsenal/Glory Tree/
// Challenges are coherent "coming soon" placeholders (rule 14, ⊥ broken). Records
// + Settings are live from the saved profile.

import { useEffect, useRef, useState } from 'react';
import { useUiStore, type MenuView } from '../store';
import { SocialFooter } from '../SocialFooter';
import { WEAPONS } from '../../content/weapons/index';

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

function RecordsPanel() {
  const p = useUiStore((s) => s.profile);
  const m = Math.floor(p.bestTimeSec / 60);
  const s = Math.floor(p.bestTimeSec % 60);
  return (
    <Panel title="RECORDS">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          ['Best time', `${m}:${s.toString().padStart(2, '0')}`],
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

type GloryBranch = 'arsenal' | 'biology' | 'mobility';
type TreeNodeId =
  | 'root'
  | 'fleet-footed'
  | 'jump-start'
  | 'redline-servos'
  | 'afterburn-clause'
  | 'reinforced-plating'
  | 'organ-repo-insurance'
  | 'magnetized-marrow'
  | 'house-odds'
  | 'blacklist-rights'
  | 'lucky-streak'
  | 'gyro-bracing'
  | 'sponsor-auditor'
  | 'live-wire'
  | 'hair-trigger'
  | 'hunter-protocol'
  | 'frostbrand'
  | 'hemorrhage-writ';

const BRANCHES: { id: GloryBranch; label: string; blurb: string }[] = [
  { id: 'arsenal', label: 'Arsenal', blurb: 'Drafting & firepower contracts' },
  { id: 'biology', label: 'Biology', blurb: 'Survival & resistances' },
  { id: 'mobility', label: 'Mobility', blurb: 'Speed & sprint' },
];

const TREE_NODES: Record<TreeNodeId, { x: number; y: number; branch: GloryBranch; icon: string }> =
  {
    root: { x: 50, y: 88, branch: 'mobility', icon: '◆' },
    'fleet-footed': { x: 50, y: 70, branch: 'mobility', icon: '↟' },
    'jump-start': { x: 50, y: 48, branch: 'mobility', icon: '⚡' },
    'redline-servos': { x: 39, y: 58, branch: 'mobility', icon: '↯' },
    'afterburn-clause': { x: 61, y: 58, branch: 'mobility', icon: '»' },
    'reinforced-plating': { x: 27, y: 57, branch: 'biology', icon: '♥' },
    'organ-repo-insurance': { x: 17, y: 39, branch: 'biology', icon: '+' },
    'magnetized-marrow': { x: 34, y: 34, branch: 'biology', icon: '◎' },
    'house-odds': { x: 73, y: 57, branch: 'arsenal', icon: '⇄' },
    'blacklist-rights': { x: 83, y: 39, branch: 'arsenal', icon: '×' },
    'lucky-streak': { x: 66, y: 34, branch: 'arsenal', icon: '?' },
    'gyro-bracing': { x: 76, y: 22, branch: 'arsenal', icon: '⌖' },
    'sponsor-auditor': { x: 90, y: 25, branch: 'arsenal', icon: '§' },
    // Build-seeding nodes (T35+).
    'live-wire': { x: 58, y: 18, branch: 'arsenal', icon: '⌁' },
    'hair-trigger': { x: 86, y: 10, branch: 'arsenal', icon: '↻' },
    'hunter-protocol': { x: 72, y: 9, branch: 'arsenal', icon: '◇' },
    frostbrand: { x: 10, y: 24, branch: 'biology', icon: '❄' },
    'hemorrhage-writ': { x: 30, y: 19, branch: 'biology', icon: '⧫' },
  };

const TREE_EDGES: ReadonlyArray<readonly [TreeNodeId, TreeNodeId]> = [
  ['root', 'fleet-footed'],
  ['fleet-footed', 'jump-start'],
  ['fleet-footed', 'redline-servos'],
  ['fleet-footed', 'afterburn-clause'],
  ['fleet-footed', 'reinforced-plating'],
  ['fleet-footed', 'house-odds'],
  ['reinforced-plating', 'organ-repo-insurance'],
  ['reinforced-plating', 'magnetized-marrow'],
  ['house-odds', 'blacklist-rights'],
  ['house-odds', 'lucky-streak'],
  ['lucky-streak', 'gyro-bracing'],
  ['blacklist-rights', 'sponsor-auditor'],
  ['lucky-streak', 'live-wire'],
  ['gyro-bracing', 'hair-trigger'],
  ['sponsor-auditor', 'hunter-protocol'],
  ['organ-repo-insurance', 'frostbrand'],
  ['magnetized-marrow', 'hemorrhage-writ'],
] as const;

// Prerequisite chain: a node unlocks only once the node it branches from is
// owned (root is always available). Forces players to spend INWARD before
// reaching the outer milestones, so a branch is a progression, not a free pick.
const TREE_PARENT: Partial<Record<TreeNodeId, TreeNodeId>> = {};
for (const [a, b] of TREE_EDGES) TREE_PARENT[b] = a;

const TREE_ORBITS: ReadonlyArray<{ x: number; y: number; r: number; branch: GloryBranch }> = [
  { x: 50, y: 63, r: 18, branch: 'mobility' },
  { x: 27, y: 47, r: 17, branch: 'biology' },
  { x: 76, y: 42, r: 20, branch: 'arsenal' },
];

function isTreeNodeId(id: string): id is TreeNodeId {
  return id in TREE_NODES;
}

function gloryBranch(branch: string): GloryBranch {
  return branch === 'arsenal' || branch === 'biology' || branch === 'mobility'
    ? branch
    : 'mobility';
}

function branchPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const curve = Math.max(6, Math.min(18, Math.abs(dx) * 0.45));
  const c1x = from.x + dx * 0.18;
  const c2x = to.x - dx * 0.22;
  const c1y = from.y - curve;
  const c2y = to.y + curve;
  return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
}

const BRANCH_STYLE = {
  arsenal: {
    line: 'stroke-gold',
    stroke: '#ffd23f',
    bg: 'bg-gold',
    border: 'border-gold',
    text: 'text-gold',
    ring: 'shadow-[0_0_22px_rgba(255,210,63,0.35)]',
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
} as const;

function GloryTree() {
  const meta = useUiStore((s) => s.meta);
  const buy = useUiStore((s) => s.buyPermanent);
  const setMenuView = useUiStore((s) => s.setMenuView);

  const [hovered, setHovered] = useState<TreeNodeId | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const byId = new Map(meta.permanents.map((p) => [p.id, p]));
  const ownedOf = (id: string | undefined): number =>
    id === 'root' ? 1 : id ? (byId.get(id)?.owned ?? 0) : 0;
  const isUnlocked = (id: TreeNodeId): boolean => {
    const parent = TREE_PARENT[id];
    return parent === undefined || ownedOf(parent) > 0;
  };
  const hoveredP = hovered ? byId.get(hovered) : undefined;
  const hoveredBranch = hovered ? gloryBranch(TREE_NODES[hovered].branch) : 'mobility';
  const hoveredLocked = hovered ? !isUnlocked(hovered) : false;
  const hoveredParent = hovered ? TREE_PARENT[hovered] : undefined;

  const clampScale = (s: number) => Math.min(2.4, Math.max(0.6, s));
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }));
  };
  const endDrag = () => {
    drag.current = null;
  };
  const reset = () => setView({ x: 0, y: 0, scale: 1 });

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

  // Horizontal compression: pulls the side branches toward centre. Eased off
  // (0.82 → 0.92) because the centred blue (mobility) branch was getting squeezed
  // between green/yellow — let the side clusters sit a touch wider so blue
  // breathes. Applied to every x a layout consumes (nodes, root, edges, rings).
  const COMPRESS = 0.92;
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
          className="absolute left-1/2 top-1/2 h-[540px] w-[760px]"
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
              const from = proj(TREE_NODES[a]);
              const to = proj(TREE_NODES[b]);
              const style = BRANCH_STYLE[TREE_NODES[b].branch];
              const open = ownedOf(a) > 0; // prerequisite met → branch edge is "live"
              const lit = hovered === a || hovered === b;
              return (
                <g key={`${a}-${b}`}>
                  <path
                    d={branchPath(from, to)}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth="2.8"
                    opacity={open ? (lit ? 0.3 : 0.14) : 0.05}
                    strokeLinecap="round"
                    filter="url(#glory-glow)"
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
            className="absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-cyan bg-pit text-2xl text-cyan shadow-[0_0_30px_rgba(50,215,255,0.38)]"
            style={{ left: `${px(TREE_NODES.root.x)}%`, top: `${TREE_NODES.root.y}%` }}
          >
            {TREE_NODES.root.icon}
          </div>

          {meta.permanents.map((p) => {
            if (!isTreeNodeId(p.id)) return null;
            const node = TREE_NODES[p.id];
            const maxed = p.owned >= p.maxLevel;
            const owned = p.owned > 0;
            const reachable = isUnlocked(p.id);
            const buyable = reachable && p.affordable && !maxed;
            // Unlocked + available to buy, but you can't afford it right now.
            const pricedOut = reachable && !maxed && !owned && !p.affordable;
            const style = BRANCH_STYLE[node.branch];
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
                onMouseEnter={() => setHovered(p.id as TreeNodeId)}
                onMouseLeave={() => setHovered((h) => (h === p.id ? null : h))}
                onFocus={() => setHovered(p.id as TreeNodeId)}
                className={`absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xl shadow-[inset_0_0_0_1px_rgba(7,5,4,0.9),0_12px_32px_rgba(0,0,0,0.5)] transition hover:scale-110 ${stateClass} ${hovered === p.id ? 'z-10 scale-110 ring-2 ring-bone/80' : ''} ${buyable ? 'cursor-pointer' : 'cursor-default'}`}
                style={{ left: `${px(node.x)}%`, top: `${node.y}%` }}
              >
                {!reachable ? '⊘' : maxed ? '★' : node.icon}
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
              </button>
            );
          })}

          {/* Tooltip anchored NEXT TO the hovered node (counter-scaled so it stays
              readable at any zoom). Flips side near the right edge. */}
          {hoveredP && hovered ? (
            <div
              className="pointer-events-none absolute z-20"
              style={{
                left: `${px(TREE_NODES[hovered].x)}%`,
                top: `${TREE_NODES[hovered].y}%`,
                transform: `translate(${px(TREE_NODES[hovered].x) > 55 ? 'calc(-100% - 30px)' : '30px'}, -50%) scale(${1 / view.scale})`,
                transformOrigin: px(TREE_NODES[hovered].x) > 55 ? 'right center' : 'left center',
              }}
            >
              <div
                className={`w-64 border bg-pit/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)] ${BRANCH_STYLE[hoveredBranch].border}`}
              >
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
