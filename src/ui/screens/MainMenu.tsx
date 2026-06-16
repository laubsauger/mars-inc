// Main menu (T27, §13.4). Opens over the rendered empty arena; options read as
// arena signage. Lilu Tubs is the only warrior in the slice; Arsenal/Glory Tree/
// Challenges are coherent "coming soon" placeholders (rule 14, ⊥ broken). Records
// + Settings are live from the saved profile.

import { useEffect, useRef, useState } from 'react';
import { useUiStore, type MenuView } from '../store';

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
        <span className="text-gold">MARS</span> <span className="text-bone">INC</span>
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

function SettingsPanel() {
  const s = useUiStore((st) => st.settings);
  const set = useUiStore((st) => st.applySetting);
  return (
    <Panel title="SETTINGS">
      <div className="rounded-md border border-rust/70 bg-umber/80 px-6 py-3">
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
        <SettingRow label="REDUCE FLASH">
          <Toggle on={s.reduceFlash} onChange={(v) => set({ reduceFlash: v })} />
        </SettingRow>
        <SettingRow label="HOLD TO SPRINT">
          <Toggle on={s.holdToSprint} onChange={(v) => set({ holdToSprint: v })} />
        </SettingRow>
        <SettingRow label="AUTO-PAUSE ON FOCUS LOSS">
          <Toggle on={s.pauseOnFocusLoss} onChange={(v) => set({ pauseOnFocusLoss: v })} />
        </SettingRow>
      </div>
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
  | 'sponsor-auditor';

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
] as const;

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
  return (
    <Panel title="GLORY TREE">
      <div className="mb-4 flex items-center justify-between gap-4 border border-rust/60 bg-pit/55 px-4 py-2">
        <div>
          <div className="text-xs uppercase text-dust">Martian Glory</div>
          <div className="text-2xl font-black text-gold tabular-nums">◆ {meta.glory}</div>
        </div>
        <div className="max-w-sm text-right text-xs leading-5 text-bone/58">
          Permanent contracts branch into run-defining engines. Current nodes are the first ring;
          later milestones expand this into the full passive web.
        </div>
      </div>

      <div className="relative h-[30rem] overflow-hidden border border-rust/70 bg-[radial-gradient(circle_at_50%_70%,rgba(50,215,255,0.14),transparent_24%),radial-gradient(circle_at_78%_36%,rgba(255,210,63,0.14),transparent_24%),radial-gradient(circle_at_25%_54%,rgba(131,240,79,0.13),transparent_22%),rgba(7,5,4,0.72)] shadow-[inset_0_0_0_1px_rgba(240,200,121,0.08)]">
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
            return (
              <ellipse
                key={`${o.branch}-${o.x}`}
                cx={o.x}
                cy={o.y}
                rx={o.r}
                ry={o.r * 0.58}
                fill="none"
                stroke={style.stroke}
                strokeWidth="0.25"
                strokeDasharray="1.2 1.4"
                opacity="0.28"
              />
            );
          })}
          {TREE_EDGES.map(([a, b]) => {
            const from = TREE_NODES[a];
            const to = TREE_NODES[b];
            const style = BRANCH_STYLE[to.branch];
            return (
              <g key={`${a}-${b}`}>
                <path
                  d={branchPath(from, to)}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth="2.8"
                  opacity="0.14"
                  strokeLinecap="round"
                  filter="url(#glory-glow)"
                />
                <path
                  d={branchPath(from, to)}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth="0.85"
                  opacity="0.85"
                  strokeLinecap="round"
                />
                <path
                  d={branchPath(from, to)}
                  fill="none"
                  stroke="#f4e4d4"
                  strokeWidth="0.18"
                  opacity="0.5"
                  strokeLinecap="round"
                  strokeDasharray="1 2"
                />
              </g>
            );
          })}
        </svg>

        <div
          className="absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-cyan bg-pit text-2xl text-cyan shadow-[0_0_30px_rgba(50,215,255,0.38)]"
          style={{ left: `${TREE_NODES.root.x}%`, top: `${TREE_NODES.root.y}%` }}
          title="Lilu Tubs baseline"
        >
          {TREE_NODES.root.icon}
        </div>

        {meta.permanents.map((p) => {
          if (!isTreeNodeId(p.id)) return null;
          const node = TREE_NODES[p.id];
          const maxed = p.owned >= p.maxLevel;
          const style = BRANCH_STYLE[node.branch];
          return (
            <button
              key={p.id}
              disabled={!p.affordable || maxed}
              onClick={() => buy(p.id)}
              className={`absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-[radial-gradient(circle_at_35%_30%,rgba(244,228,212,0.14),rgba(7,5,4,0.92)_58%)] text-xl shadow-[inset_0_0_0_1px_rgba(7,5,4,0.9),0_12px_32px_rgba(0,0,0,0.5)] transition enabled:hover:scale-110 disabled:opacity-60 ${style.border} ${style.text} ${p.owned > 0 ? style.ring : ''}`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              title={`${p.name}: ${p.description}`}
            >
              {node.icon}
              <span className="absolute -right-2 -bottom-2 rounded-full border border-rust bg-umber px-1.5 py-0.5 text-[10px] font-bold text-bone">
                {p.owned}/{p.maxLevel}
              </span>
            </button>
          );
        })}

        <div className="absolute inset-x-4 bottom-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          {BRANCHES.map((b) => {
            const style = BRANCH_STYLE[b.id];
            const total = meta.permanents
              .filter((p) => p.branch === b.id)
              .reduce((sum, p) => sum + p.owned, 0);
            return (
              <div key={b.id} className="border border-rust/60 bg-pit/72 p-2">
                <div className={`text-xs font-black uppercase ${style.text}`}>{b.label}</div>
                <div className="text-[10px] text-bone/48">{b.blurb}</div>
                <div className="mt-1 text-[10px] text-bone/70">Allocated {total}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {meta.permanents.map((p) => {
          const node = isTreeNodeId(p.id) ? TREE_NODES[p.id] : undefined;
          const branch = node?.branch ?? gloryBranch(p.branch);
          const style = BRANCH_STYLE[branch];
          const maxed = p.owned >= p.maxLevel;
          return (
            <button
              key={p.id}
              disabled={!p.affordable || maxed}
              onClick={() => buy(p.id)}
              className="flex items-center justify-between gap-4 border border-rust/60 bg-[linear-gradient(135deg,rgba(91,43,29,0.78),rgba(7,5,4,0.72))] px-3 py-2 text-left transition enabled:hover:border-gold enabled:hover:bg-iron/60 disabled:opacity-55"
            >
              <span>
                <span className={`block text-xs font-black uppercase ${style.text}`}>{p.name}</span>
                <span className="block text-[10px] text-bone/58">{p.description}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs text-bone">
                  {p.owned}/{p.maxLevel}
                </span>
                <span className="block text-[10px] text-gold">{maxed ? 'MAX' : `${p.cost} ◆`}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
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

export function MainMenu() {
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
      return <ComingSoon title="ARSENAL" blurb="Browse and preview weapons before a run." />;
    case 'glory':
      return <GloryTree />;
    case 'challenges':
      return <ComingSoon title="CHALLENGES" blurb="Daily seeds, redline mode, boss rush." />;
    case 'root':
      return <Root />;
  }
}
