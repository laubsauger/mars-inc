// Main menu (T27, §13.4). Opens over the rendered empty arena; options read as
// arena signage. Lilu Tubs is the only warrior in the slice; Arsenal/Glory Tree/
// Challenges are coherent "coming soon" placeholders (rule 14, ⊥ broken). Records
// + Settings are live from the saved profile.

import { useRef } from 'react';
import { useUiStore, type MenuView } from '../store';
import { SocialFooter } from '../SocialFooter';
import { ARENAS, type ArenaId, DIFFICULTIES } from '../../sim/arena';
import { actFor } from '../../content/acts';
import { Frame, MenuShell } from './menu/shared';
import { GloryTree } from './menu/GloryTree';
import { WarriorPanel } from './menu/WarriorPanel';
import { RecordsPanel } from './menu/RecordsPanel';
import { SettingsPanel } from './menu/SettingsPanel';
import { ArsenalPanel } from './menu/ArsenalPanel';
import { CreditsPanel } from './menu/CreditsPanel';
import { AchievementsPanel } from './menu/AchievementsPanel';
export { SettingsControls, SettingsTabs } from './menu/SettingsPanel'; // PauseScreen imports via ./MainMenu

const PRIMARY_ITEM = { label: 'Enter the Pit', sub: 'Begin a run', icon: '⚔' };

const ITEMS: { view: MenuView; label: string; sub: string; icon: string }[] = [
  { view: 'warrior', label: 'Warrior', sub: 'Choose your fighter', icon: '♟' },
  { view: 'arsenal', label: 'Arsenal', sub: 'Weapon rack', icon: '⚒' },
  { view: 'glory', label: 'Glory Tree', sub: 'Permanent upgrades', icon: '◆' },
  { view: 'challenges', label: 'Achievements', sub: 'Trophies & oddities', icon: '✪' },
  { view: 'records', label: 'Records', sub: 'Your best runs', icon: '☰' },
  { view: 'settings', label: 'Settings', sub: 'Audio & options', icon: '⚙' },
];

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
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-y-1 px-1">
        <span className="text-[11px] uppercase tracking-widest text-dust">Select Act</span>
        <DifficultyChips />
      </div>
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
                  Slay the Gatekeeper in Act 1 to unlock the next contract.
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
                {/* No per-act Glory chip — the global difficulty tier owns Glory scaling
                    now (acts are sequential content, not difficulty choices). */}
              </div>
              <div className="text-sm font-black text-bone">{a.name}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-bone/60">{a.tagline}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-bone/45">
                {(() => {
                  const act = actFor(a.act);
                  const final = act.bosses[act.bosses.length - 1];
                  return (
                    <span>
                      {act.bosses.length} bosses · final{' '}
                      <span className="text-bleed/80">☠ {final?.name ?? '???'}</span>
                    </span>
                  );
                })()}
                {selected ? <span className="ml-1 text-bone/70">· selected</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Global DIFFICULTY chips (T-Act) — integrated top-right of the Act selector. ALL
// tiers are always shown; Standard (index 0) is always available, the harder tiers
// stay LOCKED until the Act-2 final boss falls once (profile.difficultyUnlocked).
// The chosen tier scales enemy HP / pace / Glory on EVERY arena, so Act 1 stays a
// live challenge and progression is a clear ladder.
function DifficultyChips() {
  const difficulty = useUiStore((s) => s.settings.difficulty);
  const set = useUiStore((s) => s.applySetting);
  const unlocked = useUiStore((s) => s.profile.difficultyUnlocked);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-[10px] uppercase tracking-widest text-dust/70">Difficulty</span>
      {DIFFICULTIES.map((d, i) => {
        const locked = i > 0 && !unlocked;
        const selected = (difficulty ?? 0) === i;
        return (
          <button
            key={d.id}
            disabled={locked}
            onClick={() => set({ difficulty: i })}
            title={
              locked
                ? 'Defeat the Act 2 final boss to unlock harder tiers'
                : `Enemy HP ×${d.hpMult} · pace ×${d.paceMult} · Glory ×${d.gloryMult}`
            }
            className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide transition focus:outline-none ${
              selected
                ? 'border-gold bg-gold/15 text-gold'
                : locked
                  ? 'cursor-not-allowed border-rust/30 bg-pit/40 text-bone/30'
                  : 'border-rust/55 bg-pit/45 text-bone/70 hover:border-bone/40'
            }`}
          >
            {locked ? '🔒 ' : ''}
            {d.name}
          </button>
        );
      })}
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
          <span className="flex min-w-0 items-center gap-5">
            <span className="w-11 shrink-0 text-center text-[2.7rem] leading-none text-gold drop-shadow-[0_0_10px_rgba(255,210,63,0.4)] transition group-hover:scale-110 group-hover:text-cyan">
              {PRIMARY_ITEM.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-2xl font-black text-bone">{PRIMARY_ITEM.label}</span>
              <span className="mt-1 block text-sm text-bone/82">{PRIMARY_ITEM.sub}</span>
            </span>
          </span>
          <span className="ml-4 shrink-0 border border-pit/80 bg-pit/70 px-3 py-1 text-sm font-black text-gold transition group-hover:text-cyan">
            START
          </span>
        </button>

        <ActSelector />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ITEMS.map((it) => (
            <button
              key={it.view}
              onClick={() => setMenuView(it.view)}
              className="group flex min-h-[4.25rem] items-center gap-4 rounded-sm border border-rust/85 bg-umber/82 px-4 py-3.5 text-left shadow-[inset_0_0_0_1px_rgba(7,5,4,0.75)] transition hover:border-cyan hover:bg-[linear-gradient(135deg,rgba(143,63,36,0.68),rgba(50,215,255,0.14))] focus:border-gold focus:outline-none"
            >
              <span className="w-8 shrink-0 text-center text-3xl leading-none text-gold/90 transition group-hover:scale-110 group-hover:text-cyan">
                {it.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black text-bone md:text-lg">{it.label}</span>
                <span className="mt-0.5 block text-xs text-bone/62 group-hover:text-bone/88">
                  {it.sub}
                </span>
              </span>
              <span className="shrink-0 text-xl text-rust/70 transition group-hover:translate-x-0.5 group-hover:text-cyan">
                ▸
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end border-t border-rust/50 pt-3">
          <button
            onClick={() => setMenuView('credits')}
            className="flex items-center gap-1.5 rounded-sm border border-rust/70 bg-pit/60 px-3 py-1.5 text-xs uppercase text-bone/60 transition hover:border-gold hover:text-gold focus:border-gold focus:outline-none"
          >
            <span aria-hidden>✦</span>
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
      return <AchievementsPanel />;
    case 'root':
      return <Root />;
  }
}

/** Quick mute toggle pinned to the menu corner — first thing a new visitor reaches
 *  for. Toggles master volume to 0 and back (remembers the prior level), persisting
 *  through applySetting like every other audio control. */
function MuteButton() {
  const master = useUiStore((s) => s.settings.masterVolume);
  const set = useUiStore((s) => s.applySetting);
  const muted = master <= 0;
  // Remember the last audible level so unmute restores it (not a fixed default).
  const prior = useRef(0.7);
  if (master > 0) prior.current = master;
  return (
    <button
      type="button"
      aria-label={muted ? 'Unmute' : 'Mute'}
      title={muted ? 'Unmute' : 'Mute'}
      onClick={() => set({ masterVolume: muted ? prior.current : 0 })}
      className={`pointer-events-auto fixed right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-sm border bg-pit/70 backdrop-blur-[2px] transition focus:outline-none ${
        muted
          ? 'border-bleed/70 text-bleed hover:border-bleed'
          : 'border-rust/70 text-bone/80 hover:border-gold hover:text-gold'
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {muted ? (
          <>
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </>
        ) : (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 5a9 9 0 0 1 0 14" />
          </>
        )}
      </svg>
    </button>
  );
}

export function MainMenu() {
  // Socials pinned to the viewport on EVERY menu view (not just the root screen).
  return (
    <>
      <MuteButton />
      <ActiveMenu />
      <SocialFooter className="fixed inset-x-0 bottom-3 z-20 short:bottom-1" />
    </>
  );
}
