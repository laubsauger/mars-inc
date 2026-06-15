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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const setMenuView = useUiStore((s) => s.setMenuView);
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-pit/85 p-8 font-mono">
      <div className="mb-6 text-2xl font-bold tracking-[0.3em] text-ember">{title}</div>
      <div className="w-[40rem] max-w-[90vw]">{children}</div>
      <button
        onClick={() => setMenuView('root')}
        className="mt-8 rounded border border-rust px-6 py-2 text-sm tracking-widest text-bone transition hover:border-gold"
      >
        ◂ BACK
      </button>
    </div>
  );
}

function WarriorPanel() {
  return (
    <Panel title="WARRIOR">
      <div className="rounded-md border-2 border-gold bg-umber/80 p-6">
        <div className="text-xl font-bold text-bone">Mara Vex</div>
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
      <div className="grid grid-cols-2 gap-4">
        {[
          ['Best time', `${m}:${s.toString().padStart(2, '0')}`],
          ['Best level', `${p.bestLevel}`],
          ['Most kills', `${p.mostKills}`],
          ['Runs played', `${p.runCount}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-rust/50 bg-umber/70 p-4 text-center">
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
      <div className="rounded-md border border-rust/50 bg-umber/70 p-6">
        <label className="flex items-center justify-between gap-4 text-sm text-bone">
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

function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <Panel title={title}>
      <div className="rounded-md border border-dashed border-rust/60 bg-umber/60 p-8 text-center">
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
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center font-mono">
      <div className="mb-1 text-sm tracking-[0.5em] text-ember">THE RUST CROWN</div>
      <h1 className="mb-10 text-6xl font-black tracking-[0.2em] text-bone drop-shadow-[0_0_24px_rgba(196,106,43,0.5)]">
        MARS PIT
      </h1>
      <div className="grid w-[44rem] max-w-[92vw] grid-cols-2 gap-3">
        {ITEMS.map((it) => (
          <button
            key={it.view}
            onClick={() => (it.view === 'enter' ? enterPit() : setMenuView(it.view))}
            className={`group flex items-center justify-between rounded-md border-2 px-5 py-3 text-left transition hover:-translate-y-0.5 ${
              it.view === 'enter'
                ? 'col-span-2 border-gold bg-ember/20 hover:bg-ember/30'
                : 'border-rust bg-umber/70 hover:border-gold'
            }`}
          >
            <span>
              <span className="block text-lg font-bold tracking-widest text-bone">{it.label}</span>
              <span className="text-xs text-bone/55">{it.sub}</span>
            </span>
            <span className="text-rust transition group-hover:text-gold">▸</span>
          </button>
        ))}
      </div>
    </div>
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
      return (
        <ComingSoon
          title="GLORY TREE"
          blurb="Spend Martian Glory on a constellation of upgrades."
        />
      );
    case 'challenges':
      return <ComingSoon title="CHALLENGES" blurb="Daily seeds, redline mode, boss rush." />;
    case 'root':
      return <Root />;
  }
}
