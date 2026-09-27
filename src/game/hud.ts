import { createStore } from './store';

export interface HudState {
  /** The terminal panel is docked at the bottom of the screen. */
  terminalOpen: boolean;
  /**
   * Bumped whenever the player opens the terminal on purpose, so it takes keyboard focus
   * then and only then. On first load the world keeps focus so WASD works right away.
   */
  terminalFocusRequests: number;
}

export const hud = createStore<HudState>({ terminalOpen: true, terminalFocusRequests: 0 });

export function toggleTerminal(): void {
  const { terminalOpen, terminalFocusRequests } = hud.get();
  hud.update({
    terminalOpen: !terminalOpen,
    terminalFocusRequests: terminalOpen ? terminalFocusRequests : terminalFocusRequests + 1,
  });
}
