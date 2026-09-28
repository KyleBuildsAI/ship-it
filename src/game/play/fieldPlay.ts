import { endDrill } from '../../mentor/drillGuard';
import { requireFieldMission } from '../missions/schema';
import { saveProgressNow } from '../progress';
import { getAct } from './catalog';
import { verifyPaste, type FieldVerdict } from './fieldCheck';
import { play } from './playStore';
import { recordFieldMission } from './saveRules';

/**
 * The Field Mission happens outside the game, on Kyle's real repo. The game only reads
 * what he pastes back, so there is no sandbox to load here.
 */
export function startFieldMission(act: number): void {
  // Throws before anything changes when this Act's Field Mission isn't built yet.
  requireFieldMission(getAct(act).act);
  endDrill();
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
