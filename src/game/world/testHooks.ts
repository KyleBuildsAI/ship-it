import type { ZoneId } from '../worldState';

/**
 * Read-only peeks at the 3D world for end-to-end tests, so they can check a jump without
 * guessing from pixels. Installed only when the browser is under automation
 * (`navigator.webdriver`, which Playwright sets), so players never get them.
 */
export interface WorldTestHooks {
  avatarHeight: () => number;
  zone: () => ZoneId;
}

declare global {
  interface Window {
    __shipItTest?: WorldTestHooks;
  }
}

/** Returns a function that removes the hooks again. */
export function installTestHooks(hooks: WorldTestHooks): () => void {
  if (!navigator.webdriver) return () => undefined;
  window.__shipItTest = hooks;
  return () => {
    delete window.__shipItTest;
  };
}
