import { useUiStore } from '../../store';
import { Panel, fmtTime } from './shared';

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

export function RecordsPanel() {
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
