/**
 * The fixture builder lives in src/engine/fixtures.ts, next to the workspace it builds, so
 * Act 1's laptop steps can join git's there. It's re-exported here so Act 2's content and
 * tests keep their imports.
 */
export {
  buildWorkspace,
  DEFAULT_EDIT,
  defaultDeps,
  FixtureBuilder,
  folder,
  repo,
  type FixtureStep,
} from '../fixtures';
