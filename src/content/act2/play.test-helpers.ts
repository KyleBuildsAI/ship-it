import { expect } from 'vitest';
import type { FixtureStep } from '../../engine/git/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { Shell } from '../../engine/shell/shell';
import { createSandbox } from '../../game/missions/sandbox';

/**
 * Test-only helpers for playing Act 2 the way Kyle does: typing real command lines into
 * the same Shell the terminal uses. Nothing here reaches into the engine directly, so a
 * passing test proves the typed commands themselves reach the graded state.
 */

const DISPLAY_ROOT = 'C:\\Users\\kyle\\quillwork\\app';

/** A fresh sandbox from a setup, with deterministic commit ids, behind a real Shell. */
export function sandboxShell(setup: readonly FixtureStep[]): Shell {
  return new Shell(createSandbox(setup, testDeps()), DISPLAY_ROOT);
}

/**
 * Types one command line and fails the test if it errors. A reference solution that
 * only works because an error was ignored would prove nothing.
 */
export function enter(shell: Shell, command: string): void {
  const result = shell.run(command);
  const output = result.lines.map((line) => line.text).join('\n');
  expect(result.exitCode, `"${command}" failed:\n${output}`).toBe(0);
}
