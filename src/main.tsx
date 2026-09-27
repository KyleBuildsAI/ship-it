import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { devStatus } from './game/devStatus';
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

// three.js is large, so the 3D world loads as a separate chunk after the HUD has painted.
import('./game/world/boot')
  .then(({ bootWorld }) => bootWorld(sceneRoot))
  .catch((error: unknown) => {
    devStatus.update({ backend: 'failed' });
    console.error('[ship-it] the 3D world failed to start', error);
  });
