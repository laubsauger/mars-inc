// React UI layer (§C: React+Tailwind for menus/screens only, ⊥ combat entities).
// Mounted above the Three canvas. Screens/HUD driven by the Zustand store, each
// subscribing to a narrow slice (§14.1) so combat HUD ticks don't re-render the
// rest of the tree (and never the canvas, which is outside React).

import { createRoot, type Root } from 'react-dom/client';
import { Unsupported } from './screens/Unsupported';
import { UpgradeScreen } from './screens/UpgradeScreen';
import { BossRewardScreen } from './screens/BossRewardScreen';
import { PauseScreen } from './screens/PauseScreen';
import { FloatingLayer } from './FloatingLayer';
import { GameOverScreen } from './screens/GameOverScreen';
import { MainMenu } from './screens/MainMenu';
import { Hud } from './Hud';
import { useUiStore } from './store';
import './index.css';

function App() {
  const screen = useUiStore((s) => s.screen);
  switch (screen) {
    case 'unsupported':
      return <Unsupported />;
    case 'menu':
      return <MainMenu />;
    case 'arena':
      return (
        <>
          <FloatingLayer />
          <Hud />
          <UpgradeScreen />
          <BossRewardScreen />
          <PauseScreen />
        </>
      );
    case 'gameover':
      return <GameOverScreen />;
    case 'boot':
      return null;
  }
}

export function mountUi(parent: HTMLElement): void {
  const el = document.createElement('div');
  el.className = 'pointer-events-none fixed inset-0 z-50';
  parent.appendChild(el);
  const root: Root = createRoot(el);
  root.render(<App />);
}
