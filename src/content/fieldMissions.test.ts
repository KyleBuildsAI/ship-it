import { describe, expect, it } from 'vitest';
import type { FieldMission } from '../game/missions/schema';
import { verifyPaste } from '../game/play/fieldCheck';
import { ACTS } from './index';

/*
 * Rules every shipped Field Mission keeps, checked across all of them at once so a new
 * mission can't quietly break one. Each Act's own tests check its mission's real pastes.
 */

const FIELD_MISSIONS: readonly (readonly [number, FieldMission])[] = ACTS.flatMap((content) =>
  content.act.fieldMission === undefined
    ? []
    : [[content.act.act, content.act.fieldMission] as const],
);

describe.each(FIELD_MISSIONS)('Act %i Field Mission', (_act, field) => {
  it('refuses a summary in place of git ls-files output, before the secret check', () => {
    const lists = field.verifications.filter((check) => check.parser === 'ls-files');
    for (const check of lists) {
      for (const summary of ['all clean', 'hello']) {
        const verdict = verifyPaste(check, summary);
        expect(verdict.passed, `${check.id}: ${summary}`).toBe(false);
        expect(verdict.message, check.id).toContain("doesn't look like git ls-files output");
      }
    }
  });
});
