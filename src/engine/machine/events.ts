/**
 * Where an environment variable lives: 'session' is one terminal tab, 'user' is saved for
 * this user's new terminals, and 'machine' is saved for every user (admins only).
 */
export type EnvScope = 'session' | 'user' | 'machine';

/**
 * What the simulated Windows machine announces, alongside git's events on the same
 * stream. Environment events carry the variable's name, never its value, so nothing that
 * logs or draws events can leak a secret.
 */
export type MachineEvent =
  | {
      readonly type: 'cwdChanged';
      readonly session: number;
      readonly from: string;
      readonly to: string;
      /** How the player got there, so the world can light the route they took. */
      readonly via: 'relative' | 'absolute' | 'home' | 'back';
    }
  | {
      readonly type: 'envChanged';
      readonly scope: EnvScope;
      /** The terminal tab, for session-scope changes. */
      readonly session: number | null;
      readonly name: string;
      readonly change: 'set' | 'removed';
    }
  | {
      readonly type: 'sessionOpened' | 'sessionClosed' | 'sessionActivated';
      readonly session: number;
    }
  | { readonly type: 'terminalsRestarted' };
