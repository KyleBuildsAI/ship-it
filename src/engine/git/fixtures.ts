/**
 * The fixture builder moved to src/engine/fixtures.ts when Act 1's laptop steps joined
 * git's. It's re-exported here so Act 2's content and tests keep their imports.
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
