import type { FixtureStep } from '../../engine/git/fixtures';
import { Shell } from '../../engine/shell/shell';
import type { Workspace } from '../../engine/workspace';
import { announce } from '../hud';
import type { SandboxQueries } from '../missions/predicates';
import { createSandbox, sandboxQueries } from '../missions/sandbox';
import { DISPLAY_ROOT, sandbox } from '../sandbox';

/**
 * Swaps the player's sandbox for a fresh one built from `steps`, and says why in the
 * terminal. The 3D world follows the sandbox store, so crates and history redraw too.
 */
export function loadSandbox(steps: readonly FixtureStep[], notice: string): Workspace {
  const ws = createSandbox(steps);
  sandbox.update({ shell: new Shell(ws, DISPLAY_ROOT), openFile: null });
  announce(notice);
  return ws;
}

export function currentWorkspace(): Workspace {
  return sandbox.get().shell.ws;
}

/** What predicates are checked against: the sandbox as it is right now, laptop included. */
export function currentQueries(): SandboxQueries {
  return sandboxQueries(currentWorkspace());
}

/**
 * Calls `onChange` once after any burst of changes to the sandbox (a command, a saved
 * edit, a boss twist), and keeps watching when a new sandbox replaces the old one.
 * Grading by state means this is the only signal play needs: no command parsing.
 */
export function watchSandbox(onChange: () => void): () => void {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    // One `git add .` fires an event per file; check once, after the command finishes.
    queueMicrotask(() => {
      scheduled = false;
      onChange();
    });
  };
  let watched = currentWorkspace();
  let stopEvents = watched.events.on(schedule);
  const stopStore = sandbox.subscribe(() => {
    const ws = currentWorkspace();
    if (ws === watched) return;
    stopEvents();
    watched = ws;
    stopEvents = ws.events.on(schedule);
    schedule();
  });
  return () => {
    stopEvents();
    stopStore();
  };
}
