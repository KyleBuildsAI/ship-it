import { closeActMenu, hud } from '../hud';
import type { Act } from '../missions/schema';
import { progress, updateSave } from '../progress';
import type { SaveData } from '../save/schema';
import { findAct } from './catalog';
import { missionDone } from './saveRules';

/*
 * "Unlock everything" in Settings: every Act at once. It shows a tab for every Act, opens
 * every boss before its missions are done, lets Act 1's laptop be tried, and says plainly
 * what isn't built yet. It's a saved setting, on by default while the course is being
 * built; turning it off gives normal progression.
 */

/** The address flag that turns preview mode on: `?unlock=all`. Only a flag, never a secret. */
export const UNLOCK_PARAM = 'unlock';
export const UNLOCK_VALUE = 'all';

/** Whether preview mode is on. No save yet reads as off. */
export function isUnlocked(save: SaveData | null): boolean {
  return save?.settings.unlockAll === true;
}

/** Whether a page address's query (`location.search`) asks for preview mode. */
export function asksToUnlock(search: string): boolean {
  return new URLSearchParams(search).get(UNLOCK_PARAM) === UNLOCK_VALUE;
}

/** The save with preview mode on or off. The same object when nothing changes, so no write. */
export function withUnlock(save: SaveData, on: boolean): SaveData {
  if (save.settings.unlockAll === on) return save;
  return { ...save, settings: { ...save.settings, unlockAll: on } };
}

/** `href` without the flag. Every other parameter, and the #hash, stay as they were. */
export function withoutUnlockParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(UNLOCK_PARAM);
  return url.toString();
}

/** The page's address: the browser's location and history, or a fake in tests. */
export interface AddressBar {
  readonly href: () => string;
  readonly replace: (href: string) => void;
}

/** The real address bar. replaceState changes the address without a reload or a history entry. */
export const browserAddress: AddressBar = {
  href: () => window.location.href,
  replace: (href) => {
    window.history.replaceState(window.history.state, '', href);
  },
};

/**
 * Turns preview mode on when the address asks for it, once the save has loaded, and keeps
 * it on: it's saved like any other setting. Then the flag leaves the address, so a reload
 * after turning preview off in Settings stays off. A save that couldn't load, or that
 * another tab has, can't take the change, so the flag stays for the next load. Returns a
 * function that stops waiting for the save.
 */
export function unlockFromAddress(address: AddressBar): () => void {
  if (!asksToUnlock(new URL(address.href()).search)) return () => undefined;
  // Turning preview on updates the progress store, which calls the listener below again
  // while it's still running. This flag makes that second call a no-op.
  let settled = false;
  const settle = (): boolean => {
    if (settled) return true;
    const { status } = progress.get();
    if (status === 'loading') return false;
    settled = true;
    if (status === 'ready') {
      updateSave((save) => withUnlock(save, true));
      address.replace(withoutUnlockParam(address.href()));
    }
    return true;
  };
  if (settle()) return () => undefined;
  const stop = progress.subscribe(() => {
    if (settle()) stop();
  });
  return stop;
}

/**
 * Why an Act's boss can be fought, or that it can't yet. 'earned': every mission is done
 * (a tested-out one counts). 'preview': it isn't, but preview mode opens it anyway.
 */
export type BossAccess = 'earned' | 'preview' | 'locked';

export function bossAccess(save: SaveData, act: Act): BossAccess {
  if (act.missionIds.every((id) => missionDone(save, id))) return 'earned';
  return isUnlocked(save) ? 'preview' : 'locked';
}

/**
 * The Settings checkbox. Turning preview off also closes an open menu for an Act the game
 * doesn't have yet, because that menu only exists in preview mode.
 */
export function setUnlockAll(on: boolean): void {
  updateSave((save) => withUnlock(save, on));
  const open = hud.get().actMenu;
  if (!on && open !== null && findAct(open) === undefined) closeActMenu();
}
