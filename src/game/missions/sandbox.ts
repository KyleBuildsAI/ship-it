import { recordCommit, stagePaths } from '../../engine/git/cli/staging';
import { buildWorkspace, defaultDeps, type FixtureStep } from '../../engine/git/fixtures';
import type { RepositoryDeps } from '../../engine/git/repository';
import type { Workspace } from '../../engine/workspace';

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
    switch (step.op) {
      case 'init':
        ws.initRepo();
        break;
      case 'write':
        ws.writeFile(step.path, step.content);
        break;
      case 'append': {
        const before = ws.fs.isFile(step.path) ? ws.fs.readFile(step.path) : '';
        ws.writeFile(step.path, before + step.text);
        break;
      }
      case 'delete':
        ws.deleteFile(step.path);
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
