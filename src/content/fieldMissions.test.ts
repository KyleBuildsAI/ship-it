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

/** Quoted passages in `text`, like `Tell it: "Push the branch..."`, with straight or curly quotes. */
function quotedPassages(text: string): string[] {
  return [...text.matchAll(/["“]([^"“”]+)["”]/g)].map((match) => match[1] ?? '');
}

// A quoted commit message or button name is a few words; a quoted brief is a sentence or more.
const LONGEST_QUOTE_WORDS = 8;

describe.each(FIELD_MISSIONS)('Act %i Field Mission', (_act, field) => {
  it('gives every brief its own Copy button, outside the checkbox label', () => {
    // A task's text is the checkbox's label, so selecting a brief there ticks the task.
    for (const item of field.checklist) {
      for (const quote of quotedPassages(item.text)) {
        const words = quote.split(/\s+/).filter((word) => word !== '').length;
        expect(words, `${item.id}: "${quote}" belongs in prompt`).toBeLessThanOrEqual(
          LONGEST_QUOTE_WORDS,
        );
      }
      expect(item.text, item.id).not.toMatch(/Get-Command|-ErrorAction/);
    }
  });

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
