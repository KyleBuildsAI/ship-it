import { createStore } from './store';
import type { Suggestion } from './world/suggestions';

/** A command the HUD asked the terminal to type (and maybe run). `id` makes each request unique. */
export interface PendingCommand {
  readonly text: string;
  readonly run: boolean;
  readonly cursorFromEnd: number;
  readonly id: number;
}

/** A line the game prints in the terminal, like "Mission 2.1: a fresh project is ready". */
export interface TerminalNotice {
  readonly text: string;
  readonly id: number;
}

/** The Campus menus reachable from the HUD (DESIGN.md section 4). */
export type MenuId = 'standup' | 'trophies' | 'settings';

export interface HudState {
  /** The terminal panel is docked at the bottom of the screen. */
  terminalOpen: boolean;
  /**
   * Bumped whenever the player opens the terminal on purpose, so it takes keyboard focus
   * then and only then. On first load the world keeps focus so WASD works right away.
   */
  terminalFocusRequests: number;
  /** The command a click in the world maps to, shown as a chip until run or dismissed. */
  suggestion: Suggestion | null;
  pendingCommand: PendingCommand | null;
  notice: TerminalNotice | null;
  /** The menu open over the world, if any. */
  menu: MenuId | null;
  /** Act 2's menu, opened from the HUD so it's reachable outside the Git World too. */
  actMenuOpen: boolean;
  /** Commands the player has run this session. The tutorial watches it grow. */
  commandsRun: number;
  /** Times the terminal was shown or hidden this session, also for the tutorial. */
  terminalToggles: number;
}

export const hud = createStore<HudState>({
  terminalOpen: true,
  terminalFocusRequests: 0,
  suggestion: null,
  pendingCommand: null,
  notice: null,
  menu: null,
  actMenuOpen: false,
  commandsRun: 0,
  terminalToggles: 0,
});

export function toggleTerminal(): void {
  const { terminalOpen, terminalFocusRequests, terminalToggles } = hud.get();
  hud.update({
    terminalOpen: !terminalOpen,
    terminalFocusRequests: terminalOpen ? terminalFocusRequests : terminalFocusRequests + 1,
    terminalToggles: terminalToggles + 1,
  });
}

/** Counts a command the player ran in the terminal. */
export function countCommand(): void {
  hud.update({ commandsRun: hud.get().commandsRun + 1 });
}

export function suggest(suggestion: Suggestion | null): void {
  hud.update({ suggestion });
}

/** Types a command into the terminal, running it too when `run` is true. */
export function sendToTerminal(text: string, run: boolean, cursorFromEnd = 0): void {
  const { pendingCommand, terminalFocusRequests } = hud.get();
  hud.update({
    terminalOpen: true,
    terminalFocusRequests: terminalFocusRequests + 1,
    suggestion: null,
    pendingCommand: { text, run, cursorFromEnd, id: (pendingCommand?.id ?? 0) + 1 },
  });
}

/** Prints a line from the game in the terminal, e.g. when a mission swaps the sandbox. */
export function announce(text: string): void {
  const { notice } = hud.get();
  hud.update({ notice: { text, id: (notice?.id ?? 0) + 1 } });
}

export function openMenu(menu: MenuId | null): void {
  hud.update({ menu });
}

export function toggleActMenu(): void {
  hud.update({ actMenuOpen: !hud.get().actMenuOpen });
}
