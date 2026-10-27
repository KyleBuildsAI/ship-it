import { parseRepoSlug } from '../../engine/verify';
import { endDrill } from '../../mentor/drillGuard';
import { closeTerminal } from '../hud';
import { requireFieldMission } from '../missions/schema';
import { progress, saveProgressNow } from '../progress';
import { getAct } from './catalog';
import { verifyPaste, type FieldVerdict } from './fieldCheck';
import { browserGet, checkMergedPullRequest, type GitHubGet } from './githubCheck';
import { play } from './playStore';
import { recordFieldMission, recordGitHubCheck, tickFieldTask } from './saveRules';

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

/** A checked paste, as the Field Mission panel shows it. */
export interface FieldSubmission extends FieldVerdict {
  /**
   * True when this pass was the last check, so the whole mission is verified now. The
   * panel says so beside this check, where the player is looking, not only at the top.
   */
  readonly completedMission?: boolean;
}

/** When the Field Mission with this id was verified, or null if it isn't yet. */
function verifiedAt(fieldId: string): string | null {
  return progress.get().save?.fieldMissions[fieldId]?.verifiedAt ?? null;
}

/** Checks one pasted output and, when it passes, records that check in the save. */
export function submitFieldPaste(
  verificationId: string,
  text: string,
  now: Date = new Date(),
): FieldSubmission {
  const current = play.get().activity;
  if (current?.kind !== 'field') {
    return { passed: false, message: 'No Field Mission is open.' };
  }
  const { act } = getAct(current.act);
  const field = requireFieldMission(act);
  const verification = field.verifications.find((entry) => entry.id === verificationId);
  if (verification === undefined) {
    return { passed: false, message: 'That check is not part of this Field Mission.' };
  }
  const verdict = verifyPaste(verification, text);
  if (!verdict.passed) return verdict;
  const wasVerified = verifiedAt(field.id) !== null;
  saveProgressNow((save) => recordFieldMission(save, act, [verification.id], now));
  return !wasVerified && verifiedAt(field.id) !== null
    ? { ...verdict, completedMission: true }
    : verdict;
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

/** Ticks or unticks a checklist task of the open Field Mission, saved at once. */
export function setFieldTaskDone(taskId: string, done: boolean): void {
  const current = play.get().activity;
  if (current?.kind !== 'field') return;
  const { act } = getAct(current.act);
  saveProgressNow((save) => tickFieldTask(save, act, taskId, done));
}
