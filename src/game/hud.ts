import { createStore } from './store';

export interface HudState {
  /** The terminal panel is docked at the bottom of the screen. */
  terminalOpen: boolean;
}

export const hud = createStore<HudState>({ terminalOpen: true });

export function toggleTerminal(): void {
  hud.update({ terminalOpen: !hud.get().terminalOpen });
}
