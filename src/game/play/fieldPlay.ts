import { endDrill } from '../../mentor/drillGuard';
import { updateSave } from '../progress';
import { getCatalog } from './catalog';
import { verifyPaste, type FieldVerdict } from './fieldCheck';
import { play } from './playStore';
import { recordFieldMission } from './saveRules';

/**
 * The Field Mission happens outside the game, on Kyle's real repo. The game only reads
 * what he pastes back, so there is no sandbox to load here.
 */
export function startFieldMission(): void {
  endDrill();
  play.update({ activity: { kind: 'field' }, checklist: [] });
}

/** Checks one pasted output and, when it passes, records that check in the save. */
export function submitFieldPaste(
  verificationId: string,
  text: string,
  now: Date = new Date(),
): FieldVerdict {
  const { act } = getCatalog();
  const verification = act.fieldMission.verifications.find((entry) => entry.id === verificationId);
  if (verification === undefined) {
    return { passed: false, message: 'That check is not part of this Field Mission.' };
  }
  const verdict = verifyPaste(verification, text);
  if (verdict.passed) updateSave((save) => recordFieldMission(save, act, [verification.id], now));
  return verdict;
}
