import { recordCommit, stagePaths } from '../../engine/git/cli/staging';
import {
  buildWorkspace,
  defaultDeps,
  deleteSandboxFile,
  readSandboxFile,
  writeSandboxFile,
  type FixtureStep,
} from '../../engine/fixtures';
import { applyMachineStep, isMachineStep } from '../../engine/machine/fixtures';
import { gitQueries } from '../../engine/git/queries';
import type { RepositoryDeps } from '../../engine/git/repository';
import { machineQueries } from '../../engine/machine/queries';
import type { Workspace } from '../../engine/workspace';
import type { SandboxQueries } from './predicates';

/**
 * A fresh sandbox for a mission, drill, or boss, built from its setup steps. Tests pass
 * `testDeps()` so commit ids come out the same on every run.
 */
export function createSandbox(
  steps: readonly FixtureStep[],
  deps: RepositoryDeps = defaultDeps(),
): Workspace {
  return buildWorkspace(steps, deps);
}

/**
 * Everything a check can ask about a sandbox: git's view of the project, and on a laptop,
 * the machine too. An Act 2 sandbox has no machine, so it gets git's questions alone.
 */
export function sandboxQueries(ws: Workspace): SandboxQueries {
  const git = gitQueries(ws);
  return ws.machine === null ? git : { ...git, machine: machineQueries(ws.machine) };
}

/**
 * Applies setup steps to a sandbox the player is already working in, for boss twists
 * like "Dex drops a new file on the Workbench". The engine only replays steps into a
 * brand-new workspace, so this mirrors `buildWorkspace`. A test checks that the two
 * always produce identical sandboxes.
 *
 * One difference is on purpose: staging and committing go through the same helpers as
 * `git add` and `git commit`, so they announce `staged` and `committed` events. The 3D
 * world is already on screen, and a twist it never hears about would leave it showing
 * crates in the wrong place. `buildWorkspace` can skip that because nothing is drawn yet.
 */
export function applySteps(ws: Workspace, steps: readonly FixtureStep[]): void {
  for (const step of steps) {
    if (step.op === 'windows') throw new Error('windows() starts a sandbox; it cannot change one.');
    if (isMachineStep(step)) {
      if (ws.machine === null) throw new Error(`The "${step.op}" step needs a windows() sandbox.`);
      applyMachineStep(ws.machine, step);
      continue;
    }
    switch (step.op) {
      case 'init':
        ws.initRepo();
        break;
      case 'write':
        writeSandboxFile(ws, step.path, step.content);
        break;
      case 'append':
        writeSandboxFile(ws, step.path, (readSandboxFile(ws, step.path) ?? '') + step.text);
        break;
      case 'delete':
        deleteSandboxFile(ws, step.path);
        break;
      case 'stage':
        stagePaths(ws, step.paths);
        break;
      case 'commit':
        recordCommit(ws, step.message);
        break;
    }
  }
}
