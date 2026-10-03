import type { FixtureStep } from '../../engine/fixtures';
import { laptop } from './shared';

/**
 * Act 1's free-play laptop, opened from the Act 1 menu: the same laptop the missions use,
 * with nothing to grade. It's there to try the PowerShell the laptop engine runs.
 */
export const LAPTOP_SANDBOX: readonly FixtureStep[] = laptop().toSpec();

/** What the terminal says when the laptop opens: what it is, and what to try. */
export const LAPTOP_NOTICE =
  'Act 1 laptop: real PowerShell on a Windows laptop. Try ls, cd quillwork\\api, ls -Force, mkdir notes, New-Item notes\\idea.txt, Test-Path notes, Remove-Item notes, Get-ChildItem Env:';
