// Dev control board (T74). A low-profile dev menu — a corner pill (+ F2) opens a
// panel that grants any upgrade/weapon/permanent, sets player state, and forces
// spawns/boss/reward, so a tester can build a scenario in seconds instead of
// grinding a run. Every action routes through the store `dev` bridge → the real
// sim/save APIs (V35). Compiled into all builds for now (unobtrusive), to be
// restricted later. React/Tailwind menu surface (§C allows it for screens).

import { useEffect, useReducer, useState } from 'react';
import { useUiStore } from '../store';
import { UpgradeCardContent } from '../components/UpgradeCardContent';
import { PermanentTooltipBody, permanentBranchBorder } from '../components/PermanentTooltipBody';

const RARITY_TEXT: Record<string, string> = {
  common: 'text-bone/80',
  uncommon: 'text-cyan',
  rare: 'text-gold',
  legendary: 'text-elite',
  corrupted: 'text-bleed',
  prototype: 'text-toxic',
};

function Btn({
  onClick,
  children,
  tone = 'rust',
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'rust' | 'gold' | 'bleed' | 'cyan';
}) {
  const tones: Record<string, string> = {
    rust: 'border-rust text-bone/80 hover:border-gold hover:text-gold',
    gold: 'border-gold/70 text-gold hover:bg-gold/15',
    bleed: 'border-bleed/70 text-bleed hover:bg-bleed/15',
    cyan: 'border-cyan/70 text-cyan hover:bg-cyan/15',
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border bg-pit/70 px-2 py-1 text-[11px] font-bold uppercase tracking-wide transition focus:outline-none ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-rust/30 px-3 py-2">
      <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-gold/80">
        {title}
      </div>
      {children}
    </div>
  );
}

function DevBoard() {
  const dev = useUiStore((s) => s.dev)!;
  const toggleDev = useUiStore((s) => s.toggleDev);
  const [, bump] = useReducer((n: number) => n + 1, 0); // re-read live levels after a grant
  const [persist, setPersist] = useState(false);
  const [filter, setFilter] = useState('');
  const [variant, setVariant] = useState(dev.enemies[0]?.variant ?? 0);
  const [count, setCount] = useState(5);
  const [glory, setGlory] = useState(1000);
  const [scenario, setScenario] = useState('');
  const [scenarioMsg, setScenarioMsg] = useState('');
  // Hover tooltips — reuse the IN-GAME card face + Glory-Tree tooltip (no duplicated
  // markup/descriptions). Permanent tooltip pulls the full PermanentView (description/
  // rarity/cost) from the same meta slice the Glory Tree renders.
  const permViews = useUiStore((s) => s.meta.permanents);
  const [hovCard, setHovCard] = useState<string | null>(null);
  const [hovPerm, setHovPerm] = useState<string | null>(null);
  const [hovY, setHovY] = useState(0); // cursor Y → tooltip aligns with the hovered row
  const cardOf = (id: string | null) =>
    id ? (dev.upgrades.find((u) => u.id === id) ?? null) : null;
  const permOf = (id: string | null) => (id ? (permViews.find((p) => p.id === id) ?? null) : null);
  const hoveredCard = cardOf(hovCard);
  const hoveredPerm = permOf(hovPerm);
  // Vertically center the tooltip on the cursor, clamped to stay on-screen.
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const tipTop = Math.max(120, Math.min(winH - 120, hovY));

  const cards = dev.upgrades.filter(
    (u) =>
      !filter ||
      u.name.toLowerCase().includes(filter.toLowerCase()) ||
      u.id.includes(filter.toLowerCase()) ||
      u.tags.some((t) => t.includes(filter.toLowerCase())),
  );

  return (
    <div className="pointer-events-auto fixed right-0 top-0 z-[60] flex h-full w-[22rem] max-w-[94vw] flex-col border-l-2 border-gold/50 bg-pit/95 font-mono text-bone shadow-[0_0_40px_rgba(0,0,0,0.7)] backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-rust/50 px-3 py-2">
        <div className="text-sm font-black uppercase tracking-widest text-gold">⚙ Dev Board</div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-[10px] uppercase tracking-wide text-bone/70">
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => setPersist(e.target.checked)}
              className="accent-gold"
            />
            persist
          </label>
          <Btn onClick={toggleDev} tone="rust">
            ✕
          </Btn>
        </div>
      </div>
      <div className="text-[9px] leading-snug text-bone/40 px-3 py-1.5">
        Live grants flag the run CHEATED → no records/Glory banking. Permanents/Glory honor the
        persist toggle (on = writes save, applies next run).
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="Scenario (JSON)">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Btn
              onClick={() => {
                const json = dev.exportScenario();
                setScenario(json);
                void navigator.clipboard?.writeText(json).catch(() => {});
                setScenarioMsg('exported → clipboard');
              }}
              tone="cyan"
            >
              Export
            </Btn>
            <Btn
              onClick={() => {
                const err = dev.applyScenario(scenario, persist);
                setScenarioMsg(err ? `✕ ${err}` : '✓ applied');
                bump();
              }}
              tone="gold"
            >
              Import
            </Btn>
            {scenarioMsg && <span className="text-[10px] text-bone/50">{scenarioMsg}</span>}
          </div>
          <textarea
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            spellCheck={false}
            placeholder='{"weapon":"...","upgrades":{},"permanents":{}}'
            className="h-24 w-full resize-y rounded-sm border border-rust bg-pit px-2 py-1 text-[10px] leading-tight text-bone/80"
          />
          <div className="mt-1 text-[9px] leading-snug text-bone/35">
            Export snapshots the live weapon + card levels + permanents. Import raises cards to the
            target levels (Clear/restart first for a clean apply). Shareable + scriptable.
          </div>
        </Section>
        <Section title="Player">
          <div className="flex flex-wrap gap-1.5">
            <Btn
              onClick={() => {
                dev.addLevels(1);
                bump();
              }}
            >
              +1 Lvl
            </Btn>
            <Btn
              onClick={() => {
                dev.addLevels(5);
                bump();
              }}
            >
              +5 Lvl
            </Btn>
            <Btn onClick={() => dev.heal()} tone="cyan">
              Heal
            </Btn>
            <Btn
              onClick={() => {
                dev.toggleGodmode();
                bump();
              }}
              tone={dev.godmode() ? 'gold' : 'rust'}
            >
              God {dev.godmode() ? 'ON' : 'off'}
            </Btn>
          </div>
        </Section>

        <Section title="Spawns">
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={variant}
              onChange={(e) => setVariant(Number(e.target.value))}
              className="rounded-sm border border-rust bg-pit px-1 py-1 text-[11px]"
            >
              {dev.enemies.map((e) => (
                <option key={e.variant} value={e.variant}>
                  {e.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={count}
              min={1}
              max={64}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-14 rounded-sm border border-rust bg-pit px-1 py-1 text-[11px]"
            />
            <Btn onClick={() => dev.spawn(variant, count)}>Spawn</Btn>
            <Btn onClick={() => dev.forceBoss()} tone="bleed">
              Boss
            </Btn>
            <Btn onClick={() => dev.clearEnemies()}>Clear</Btn>
            <Btn onClick={() => dev.openBossReward()} tone="gold">
              Reward
            </Btn>
          </div>
        </Section>

        <Section title="Weapon">
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              defaultValue={dev.weaponId()}
              onChange={(e) => {
                dev.setWeapon(e.target.value);
                bump();
              }}
              className="rounded-sm border border-rust bg-pit px-1 py-1 text-[11px]"
            >
              {dev.weapons.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <Btn
              onClick={() => {
                dev.evolve();
                bump();
              }}
              tone="gold"
            >
              Force Evolve
            </Btn>
          </div>
        </Section>

        <Section title={`Glory — ◆${dev.glory()}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="number"
              value={glory}
              onChange={(e) => setGlory(Number(e.target.value))}
              className="w-24 rounded-sm border border-rust bg-pit px-1 py-1 text-[11px]"
            />
            <Btn
              onClick={() => {
                dev.grantGlory(glory);
                bump();
              }}
              tone="gold"
            >
              Grant Glory
            </Btn>
          </div>
        </Section>

        <Section title={`Cards (${cards.length})`}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by name / tag…"
            className="mb-1.5 w-full rounded-sm border border-rust bg-pit px-2 py-1 text-[11px]"
          />
          <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto pr-1">
            {cards.map((u) => {
              const lvl = dev.upgradeLevelOf(u.id);
              return (
                <div
                  key={u.id}
                  onMouseEnter={(ev) => {
                    setHovCard(u.id);
                    setHovY(ev.clientY);
                  }}
                  onMouseMove={(ev) => setHovY(ev.clientY)}
                  onMouseLeave={() => setHovCard((c) => (c === u.id ? null : c))}
                  className="flex items-center justify-between gap-2 rounded-sm px-1 py-0.5 text-[11px] hover:bg-bone/5"
                >
                  <span className={`truncate ${RARITY_TEXT[u.rarity] ?? 'text-bone/80'}`}>
                    {u.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="tabular-nums text-bone/45">
                      {lvl}/{u.maxLevel}
                    </span>
                    <button
                      onClick={() => {
                        dev.grantUpgrade(u.id);
                        bump();
                      }}
                      className="rounded-sm border border-gold/60 px-1.5 text-gold hover:bg-gold/15"
                    >
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Permanents (Glory Tree)">
          <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto pr-1">
            {dev.permanents.map((p) => {
              const lvl = dev.ownedPermanent(p.id);
              return (
                <div
                  key={p.id}
                  onMouseEnter={(ev) => {
                    setHovPerm(p.id);
                    setHovY(ev.clientY);
                  }}
                  onMouseMove={(ev) => setHovY(ev.clientY)}
                  onMouseLeave={() => setHovPerm((c) => (c === p.id ? null : c))}
                  className="flex items-center justify-between gap-2 rounded-sm px-1 py-0.5 text-[11px] hover:bg-bone/5"
                >
                  <span className="truncate text-bone/80">
                    <span className="text-bone/35">{p.branch.slice(0, 3)} </span>
                    {p.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => {
                        dev.setPermanent(p.id, Math.max(0, lvl - 1), persist);
                        bump();
                      }}
                      className="rounded-sm border border-rust px-1.5 text-bone/70 hover:border-bleed hover:text-bleed"
                    >
                      −
                    </button>
                    <span className="w-8 text-center tabular-nums text-bone/45">
                      {lvl}/{p.maxLevel}
                    </span>
                    <button
                      onClick={() => {
                        dev.setPermanent(p.id, Math.min(p.maxLevel, lvl + 1), persist);
                        bump();
                      }}
                      className="rounded-sm border border-gold/60 px-1.5 text-gold hover:bg-gold/15"
                    >
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Progression / Acts">
          <div className="flex flex-wrap gap-1.5">
            <Btn
              tone={dev.isUnlocked('boss-beaten') ? 'gold' : 'rust'}
              onClick={() => {
                const on = !dev.isUnlocked('boss-beaten');
                dev.setUnlock('boss-beaten', on); // ActSelector gate
                dev.setUnlock('act-cleared:1', on); // generic next-act gate
                bump();
              }}
            >
              {dev.isUnlocked('boss-beaten') ? '✓ Act 2' : 'Unlock Act 2'}
            </Btn>
            <Btn
              tone={dev.isUnlocked('difficulty-unlocked') ? 'gold' : 'rust'}
              onClick={() => {
                dev.setUnlock('difficulty-unlocked', !dev.isUnlocked('difficulty-unlocked'));
                bump();
              }}
            >
              {dev.isUnlocked('difficulty-unlocked') ? '✓ Difficulty' : 'Unlock difficulty'}
            </Btn>
            <Btn
              tone={dev.isUnlocked('prestige:seed') ? 'gold' : 'rust'}
              onClick={() => {
                dev.setUnlock('prestige:seed', !dev.isUnlocked('prestige:seed'));
                bump();
              }}
            >
              {dev.isUnlocked('prestige:seed') ? '✓ Prestige' : 'Unlock prestige'}
            </Btn>
            <Btn
              tone="cyan"
              onClick={() => {
                for (const k of [
                  'boss-beaten',
                  'act-cleared:1',
                  'act-cleared:2',
                  'difficulty-unlocked',
                  'prestige:seed',
                ]) {
                  dev.setUnlock(k, true);
                }
                bump();
              }}
            >
              Unlock ALL
            </Btn>
            <Btn
              tone="rust"
              onClick={() => {
                for (const k of [
                  'boss-beaten',
                  'act-cleared:1',
                  'act-cleared:2',
                  'difficulty-unlocked',
                  'prestige:seed',
                ]) {
                  dev.setUnlock(k, false);
                }
                bump();
              }}
            >
              Re-lock ALL
            </Btn>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide text-bone/45">Red Dust</span>
            <Btn
              tone="rust"
              onClick={() => {
                dev.grantRedDust(10);
                bump();
              }}
            >
              +10 ❖
            </Btn>
            <Btn
              tone="rust"
              onClick={() => {
                dev.grantRedDust(-1000);
                bump();
              }}
            >
              Clear ❖
            </Btn>
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-wide text-bone/35">
            Acts, difficulty selector + end-game prestige. "Unlock ALL" opens everything so you
            never get stuck testing late content. Toggle/re-lock to verify gates.
          </div>
        </Section>
      </div>

      {/* Hover tooltips — render the SAME card face + Glory-Tree tooltip as in-game,
          parked along the board's left edge (rows scroll, so a fixed panel is simplest). */}
      {hoveredCard && (
        <div
          style={{ top: tipTop }}
          className="pointer-events-none fixed right-[22.5rem] z-[61] w-72 -translate-y-1/2 rounded-sm border border-rust/60 bg-pit/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)]"
        >
          <div
            className={`mb-1 text-[10px] font-black uppercase tracking-widest ${RARITY_TEXT[hoveredCard.rarity] ?? 'text-bone/70'}`}
          >
            {hoveredCard.rarity}
          </div>
          <UpgradeCardContent
            name={hoveredCard.name}
            description={hoveredCard.description}
            level={dev.upgradeLevelOf(hoveredCard.id)}
          />
          {hoveredCard.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {hoveredCard.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-sm border border-rust/60 bg-pit/82 px-1.5 py-0.5 text-[9px] uppercase text-gold"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {hoveredPerm && (
        <div
          style={{ top: tipTop }}
          className={`pointer-events-none fixed right-[22.5rem] z-[61] w-64 -translate-y-1/2 rounded-sm border bg-pit/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)] ${permanentBranchBorder(hoveredPerm.branch)}`}
        >
          <PermanentTooltipBody permanent={hoveredPerm} />
        </div>
      )}
    </div>
  );
}

/** Always-mounted: the corner pill + F2 toggle + the board when open. */
export function DevMenu() {
  const devOpen = useUiStore((s) => s.devOpen);
  const dev = useUiStore((s) => s.dev);
  const toggleDev = useUiStore((s) => s.toggleDev);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        toggleDev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleDev]);

  if (!dev) return null; // bridge not wired yet (boot incomplete / unsupported)
  return (
    <>
      {!devOpen && (
        <button
          onClick={toggleDev}
          title="Dev control board (F2)"
          className="pointer-events-auto fixed bottom-2 right-2 z-[60] rounded-sm border border-gold/30 bg-pit/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-gold/50 transition hover:text-gold focus:outline-none"
        >
          ⚙ dev
        </button>
      )}
      {devOpen && <DevBoard />}
    </>
  );
}
