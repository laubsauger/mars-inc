// Shared menu primitives — backdrop, frame, panel chrome, and form controls.
// Split out of MainMenu.tsx so each menu panel lives in its own file and agents
// can edit panels in parallel without colliding on one mega-file.
import { useUiStore } from '../../store';

export function MenuBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 overflow-y-auto bg-pit/72 px-4 py-6 font-mono text-bone backdrop-blur-[3px]">
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,5,4,0.35),rgba(7,5,4,0.15)_45%,rgba(7,5,4,0.55))]" />
      <div className="relative z-10 min-h-full">{children}</div>
    </div>
  );
}

export function Frame({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-2 border-rust/80 bg-pit/82 shadow-[0_24px_80px_rgba(0,0,0,0.62),inset_0_0_0_1px_rgba(240,200,121,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase text-gold">{children}</div>;
}

export function LogoLockup() {
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
        {/* Arena entry terminal. Select a contract, survive the broadcast, invoice the survivors. */}
      </p>
    </div>
  );
}

export function MenuShell({ children }: { children: React.ReactNode }) {
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

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const setMenuView = useUiStore((s) => s.setMenuView);
  return (
    <MenuShell>
      <Frame className="flex max-h-[calc(100vh-14rem)] w-full flex-col p-5 md:p-7">
        <div className="mb-5 flex shrink-0 items-center justify-between gap-4 border-b border-rust/70 pb-3">
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
        {/* Only the panel BODY scrolls (title + BACK stay pinned); the frame itself is
            capped to the viewport so the page never body-scrolls (game UI, V-no-scroll). */}
        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      </Frame>
    </MenuShell>
  );
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 border-b border-rust/30 py-2.5 text-sm text-bone last:border-0">
      <span className="tracking-widest">{label}</span>
      {children}
    </label>
  );
}

export function Slider({
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

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
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

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex justify-between">
      <span className="text-dust">{label}</span>
      <span className="tabular-nums text-bone/85">{value}</span>
    </span>
  );
}
