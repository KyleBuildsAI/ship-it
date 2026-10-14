import { parseRepoSlug } from '../../engine/verify';
import { endDrill } from '../../mentor/drillGuard';
import { closeTerminal } from '../hud';
import { requireFieldMission } from '../missions/schema';
import { saveProgressNow } from '../progress';
import { getAct } from './catalog';
import { verifyPaste, type FieldVerdict } from './fieldCheck';
import { browserGet, checkMergedPullRequest, type GitHubGet } from './githubCheck';
import { play } from './playStore';
import { recordFieldMission, recordGitHubCheck } from './saveRules';

/**
 * The Field Mission happens outside the game, on Kyle's real repo, in any Act that has
 * one. The game only reads what he pastes back, so there is no sandbox to load, and no
 * GitHub token or API key is needed. The work happens in his own PowerShell, so the
 * game's terminal closes and the checklist gets the room.
 */
export function startFieldMission(act: number): void {
  // Throws before anything changes when this Act's Field Mission isn't built yet.
  requireFieldMission(getAct(act).act);
  endDrill();
  closeTerminal();
  play.update({ activity: { kind: 'field', act }, checklist: [] });
}

/** Checks one pasted output and, when it passes, records that check in the save. */
export function submitFieldPaste(
  verificationId: string,
  text: string,
  now: Date = new Date(),
): FieldVerdict {
  const current = play.get().activity;
  if (current?.kind !== 'field') {
    return { passed: false, message: 'No Field Mission is open.' };
  }
  const { act } = getAct(current.act);
  const verification = requireFieldMission(act).verifications.find(
    (entry) => entry.id === verificationId,
  );
  if (verification === undefined) {
    return { passed: false, message: 'That check is not part of this Field Mission.' };
  }
  const verdict = verifyPaste(verification, text);
  if (verdict.passed)
    saveProgressNow((save) => recordFieldMission(save, act, [verification.id], now));
  return verdict;
}

/**
 * The opt-in GitHub check: reads the newest merged PR on the public repo Kyle named and
 * remembers the repo, and the pass, in the save. Never throws, and never completes the
 * mission on its own; the paste checks do that.
 */
export async function checkFieldOnGitHub(
  repoText: string,
  now: Date = new Date(),
  get: GitHubGet = browserGet,
): Promise<FieldVerdict> {
  const current = play.get().activity;
  if (current?.kind !== 'field') {
    return { passed: false, message: 'No Field Mission is open.' };
  }
  const { act } = getAct(current.act);
  const github = requireFieldMission(act).github;
  if (github === undefined) {
    return { passed: false, message: 'This Field Mission has no GitHub check.' };
  }
  const slug = parseRepoSlug(repoText);
  if (slug === null) {
    return {
      passed: false,
      message: 'Type it as owner/repo, like kyle/sandcastles, or paste its github.com link.',
    };
  }
  const verdict = await checkMergedPullRequest(slug, github.sections, get);
  const repo = `${slug.owner}/${slug.repo}`;
  saveProgressNow((save) => recordGitHubCheck(save, act, repo, verdict.passed ? now : null));
  return verdict;
}
