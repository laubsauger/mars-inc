// Main menu (T27, §13.4). Opens over the rendered empty arena; options read as
// arena signage. Mara Vex is the only warrior in the slice; Arsenal/Glory Tree/
// Challenges are coherent "coming soon" placeholders (rule 14, ⊥ broken). Records
// + Settings are live from the saved profile.

import { useUiStore, type MenuView } from '../store';

const ITEMS: { view: MenuView | 'enter'; label: string; sub: string }[] = [
  { view: 'enter', label: 'Enter the Pit', sub: 'Begin a run' },
  { view: 'warrior', label: 'Warrior', sub: 'Choose your fighter' },
  { view: 'arsenal', label: 'Arsenal', sub: 'Weapon rack' },
  { view: 'glory', label: 'Glory Tree', sub: 'Permanent upgrades' },
  { view: 'challenges', label: 'Challenges', sub: 'Modifiers & seeds' },
  { view: 'records', label: 'Records', sub: 'Your best runs' },
  { view: 'settings', label: 'Settings', sub: 'Audio & options' },
  { view: 'credits', label: 'Credits', sub: 'The pit crew' },
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const setMenuView = useUiStore((s) => s.setMenuView);
  return (
    <MenuBackdrop>
      <div className="flex min-h-full items-center justify-center">
        <Frame className="w-[44rem] max-w-full p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-rust/70 pb-3">
            <div>
              <Eyebrow>Rust Crown terminal</Eyebrow>
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
      </div>
    </MenuBackdrop>
  );
}

function WarriorPanel() {
  return (
    <Panel title="WARRIOR">
      <div className="rounded-md border-2 border-gold bg-umber/85 p-6 shadow-[inset_0_0_0_1px_rgba(7,5,4,0.8)]">
        <div className="text-xl font-black text-bone">Mara Vex</div>
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

function SettingsPanel() {
  const volume = useUiStore((s) => s.profile.masterVolume);
  const setVolume = useUiStore((s) => s.setMasterVolume);
  return (
    <Panel title="SETTINGS">
      <div className="rounded-md border border-rust/70 bg-umber/80 p-6">
        <label className="flex flex-col gap-3 text-sm text-bone sm:flex-row sm:items-center sm:justify-between">
          <span className="tracking-widest">MASTER VOLUME</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-64 accent-gold"
          />
          <span className="w-10 text-right tabular-nums text-bone/70">
            {Math.round(volume * 100)}
          </span>
        </label>
        <div className="mt-3 text-xs text-bone/50">
          More options (key rebind, screen shake, colorblind) land with the accessibility pass.
        </div>
      </div>
    </Panel>
  );
}

const BRANCHES: { id: string; label: string; blurb: string }[] = [
  { id: 'arsenal', label: 'Arsenal', blurb: 'Drafting & firepower contracts' },
  { id: 'biology', label: 'Biology', blurb: 'Survival & resistances' },
  { id: 'mobility', label: 'Mobility', blurb: 'Speed & sprint' },
];

function GloryTree() {
  const meta = useUiStore((s) => s.meta);
  const buy = useUiStore((s) => s.buyPermanent);
  return (
    <Panel title="GLORY TREE">
      <div className="mb-5 text-center font-mono text-lg text-gold">
        ◆ {meta.glory} <span className="text-sm text-bone/50">Martian Glory</span>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {BRANCHES.map((b) => {
          const items = meta.permanents.filter((p) => p.branch === b.id);
          return (
            <div key={b.id} className="flex flex-col gap-2">
              <div className="border-b border-rust/40 pb-1">
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-gold">
                  {b.label}
                </div>
                <div className="text-[10px] text-bone/40">{b.blurb}</div>
              </div>
              {items.length === 0 && <div className="text-xs text-bone/30">— locked —</div>}
              {items.map((p) => {
                const maxed = p.owned >= p.maxLevel;
                return (
                  <button
                    key={p.id}
                    disabled={!p.affordable}
                    onClick={() => buy(p.id)}
                    className="rounded border border-rust/50 bg-umber/80 p-2 text-left transition enabled:hover:border-gold disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-bone">{p.name}</span>
                      <span className="font-mono text-[10px] text-dust">
                        {p.owned}/{p.maxLevel}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-bone/55">{p.description}</div>
                    <div className="mt-1 font-mono text-[10px] text-gold">
                      {maxed ? 'MAX' : `${p.cost} ◆`}
                    </div>
                  </button>
                );
              })}
            </div>
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
    <MenuBackdrop>
      <div className="flex min-h-full items-center justify-center">
        <div className="flex w-[42rem] max-w-full flex-col items-center gap-4">
          <div className="relative w-full text-center">
            <div className="mx-auto mb-2 flex w-fit items-center gap-3 border border-rust/70 bg-pit/78 px-4 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
              <span className="h-2 w-2 bg-gold" />
              <Eyebrow>THE RUST CROWN</Eyebrow>
              <span className="h-2 w-2 bg-gold" />
            </div>
            <h1 className="mx-auto w-fit border-2 border-gold bg-pit/86 px-7 py-3 text-5xl font-black text-bone shadow-[0_20px_70px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(240,200,121,0.18)] drop-shadow-[0_0_18px_rgba(196,106,43,0.45)] md:text-6xl">
              MARS INC
            </h1>
            <div className="mx-auto mt-3 h-1 w-36 bg-gold" />
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-bone/74">
              Arena entry terminal. Select a contract, survive the broadcast, invoice the survivors.
            </p>
          </div>

          <Frame className="w-full p-3">
            <div className="mb-3 flex items-center justify-between border-b border-rust/70 px-2 pb-2 text-xs uppercase text-dust">
              <span>Liability waiver armed</span>
              <span>Broadcast gate open</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ITEMS.map((it) => (
                <button
                  key={it.view}
                  onClick={() => (it.view === 'enter' ? enterPit() : setMenuView(it.view))}
                  className={`group flex min-h-20 items-center justify-between rounded-sm border-2 px-4 py-3 text-left shadow-[inset_0_0_0_1px_rgba(7,5,4,0.75)] transition hover:-translate-y-0.5 focus:outline-none ${
                    it.view === 'enter'
                      ? 'sm:col-span-2 border-gold bg-ember/35 hover:bg-ember/48 focus:border-sun'
                      : 'border-rust/85 bg-umber/86 hover:border-gold hover:bg-iron/62 focus:border-gold'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-base font-black text-bone md:text-lg">
                      {it.label}
                    </span>
                    <span className="mt-1 block text-xs text-bone/68">{it.sub}</span>
                  </span>
                  <span className="ml-3 shrink-0 text-2xl text-rust transition group-hover:text-gold">
                    ▸
                  </span>
                </button>
              ))}
            </div>
          </Frame>
        </div>
      </div>
    </MenuBackdrop>
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
