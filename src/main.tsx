import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { devStatus } from './game/devStatus';
import { ACTS } from './content';
import { setCatalog } from './game/play/catalog';
import { startPlay } from './game/play/play';
import { flushProgress, startProgress } from './game/progress';
import { startTutorial } from './game/tutorial';
import { getMentorStatus } from './mentor/client';
import { App } from './ui/App';
import './ui/theme.css';

const uiRoot = document.getElementById('ui');
const sceneRoot = document.getElementById('scene');
if (!uiRoot || !sceneRoot) throw new Error('index.html is missing the #ui or #scene element');

createRoot(uiRoot).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Lights the Sage row of the dev badge. It never throws and, on the Pages build, never
// touches the network, so there's nothing to catch here.
void getMentorStatus();

// Load the save (a new game on first launch) and autosave from then on. Leaving the tab
// writes any change still waiting, so closing the browser mid-step loses nothing.
void startProgress();

// Every shipped Act, in play order. Play grades the sandbox after every change.
setCatalog({ acts: ACTS });
startPlay();

// A new save starts the first-run tutorial once it has loaded (DESIGN.md section 4).
startTutorial();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushProgress().catch((error: unknown) => {
      console.error('[ship-it] saving before the tab closed failed', error);
    });
  }
});

// three.js is large, so the 3D world loads as a separate chunk after the HUD has painted.
import('./game/world/boot')
  .then(({ bootWorld }) => bootWorld(sceneRoot))
  .catch((error: unknown) => {
    devStatus.update({ backend: 'failed' });
    console.error('[ship-it] the 3D world failed to start', error);
  });
