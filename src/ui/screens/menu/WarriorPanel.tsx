import { Panel } from './shared';

export function WarriorPanel() {
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
