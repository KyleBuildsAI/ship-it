import { describe, expect, it } from 'vitest';
import { ACTS } from '../../content';
import { isPickCard } from '../../game/missions/lessonSchema';
import { splitFeedback } from './lessonText';

describe('the verdict before an answer’s feedback', () => {
  it('is the feedback’s own when it opens with one, so it isn’t said twice', () => {
    expect(splitFeedback(true, 'Yes. Saved to disk and committed are different rooms.')).toEqual({
      verdict: 'Yes.',
      rest: 'Saved to disk and committed are different rooms.',
    });
    expect(splitFeedback(true, 'Right: the prompt names the API folder.')).toEqual({
      verdict: 'Right:',
      rest: 'the prompt names the API folder.',
    });
    expect(splitFeedback(false, 'Not yet. Conflicts only show up later.')).toEqual({
      verdict: 'Not yet.',
      rest: 'Conflicts only show up later.',
    });
  });

  it('is Right. or Not quite. when the feedback opens without one', () => {
    expect(splitFeedback(true, 'It names the value and the proof.')).toEqual({
      verdict: 'Right.',
      rest: 'It names the value and the proof.',
    });
    // "Right flag" is about the option, not a verdict on it, and this option is wrong.
    expect(splitFeedback(false, 'Right flag, wrong scope.')).toEqual({
      verdict: 'Not quite.',
      rest: 'Right flag, wrong scope.',
    });
    expect(splitFeedback(false, 'No test checked cents.')).toEqual({
      verdict: 'Not quite.',
      rest: 'No test checked cents.',
    });
  });

  it('never stutters on a shipped card, like "Right. Yes." or "Not quite. No."', () => {
    const stutters: string[] = [];
    for (const content of ACTS) {
      for (const lesson of content.lessons) {
        for (const card of lesson.cards.filter(isPickCard)) {
          for (const option of card.options) {
            const { verdict, rest } = splitFeedback(option.correct, option.feedback);
            const line = `${verdict} ${rest}`;
            const doubled = option.correct
              ? /^(?:Right|Yes|Exactly|Correct)\W+(?:Right|Yes|Exactly|Correct)\b/
              : /^(?:Not quite|Not yet|Nope|Wrong|No)\W+(?:Not quite|Not yet|Nope|Wrong|No)[.,:;!]/;
            if (doubled.test(line)) stutters.push(`${lesson.id}/${card.id}/${option.id}: ${line}`);
          }
        }
      }
    }
    expect(stutters).toEqual([]);
  });
});
