import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  checkOrder,
  finishLessonBriefing,
  moveStep,
  nextCard,
  pickOption,
  startLessonRun,
  tickLesson,
  type LessonRun,
} from '../../game/missions/lessonRunner';
import type { Lesson } from '../../game/missions/lessonSchema';
import { sampleFinal, sampleLesson } from '../../game/missions/sample.test-lesson';
import { LessonView } from './LessonView';

const T0 = Date.now();

function view(run: LessonRun, lesson: Lesson = sampleLesson, xpEarned = 0): string {
  return renderToStaticMarkup(<LessonView activity={{ kind: 'lesson', lesson, run, xpEarned }} />);
}

/** The markup's text, tags removed and React's apostrophe entity turned back. */
function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const cards = (lesson: Lesson = sampleLesson) => finishLessonBriefing(startLessonRun(lesson), T0);

describe('the lesson view', () => {
  it('opens on the briefing, one caption at a time', () => {
    const markup = view(startLessonRun(sampleLesson));
    expect(text(markup)).toContain(sampleLesson.briefing[0]);
    expect(text(markup)).not.toContain(sampleLesson.briefing[1]);
    expect(text(markup)).toContain('Skip briefing');
  });

  it("tells a final's briefing about the shared clock", () => {
    expect(text(view(startLessonRun(sampleFinal), sampleFinal))).toContain(
      'Every card shares one clock: 2:00.',
    );
  });

  it('shows a card: progress, situation, a labelled artifact, the question, options', () => {
    const markup = view(cards());
    expect(text(markup)).toContain('Card 1 of 6');
    expect(text(markup)).toContain('What would you do?');
    expect(markup).toContain('<span class="lesson-artifact__kind">Diff</span>');
    expect(markup).toContain('<span>src/auth/session.ts</span>');
    expect(markup).toContain('+  const ttlSeconds = 15 * 60 * 1000;');
    expect(markup.match(/class="lesson-option"/g)).toHaveLength(3);
    expect(text(markup)).not.toContain('Why');
  });

  it("shows a wrong pick's feedback, crossed out, with the card still open", () => {
    const markup = view(pickOption(cards(), sampleLesson, 'approve'));
    expect(markup).toContain('lesson-option lesson-option--wrong');
    expect(text(markup)).toContain('Not quite. Its claim is not proof.');
    expect(text(markup)).toContain('Try another.');
    expect(text(markup)).not.toContain('Next card');
  });

  it('shows the explanation and Next once the card is solved', () => {
    const markup = view(pickOption(cards(), sampleLesson, 'ask-units'));
    expect(markup).toContain('lesson-option lesson-option--right');
    expect(text(markup)).toContain('Right.');
    expect(text(markup)).toContain('Why Review the change, not the description.');
    expect(text(markup)).toContain('Next card');
  });

  it('shows an order card with up and down moves and Check order', () => {
    let run = cards();
    run = nextCard(pickOption(run, sampleLesson, 'ask-units'), sampleLesson);
    run = nextCard(pickOption(run, sampleLesson, 'specific'), sampleLesson);
    const markup = view(run);
    expect(text(markup)).toContain('Put it in order');
    expect(markup.match(/aria-label="Move up: /g)).toHaveLength(4);
    expect(text(markup)).toContain('Check order');
    const wrong = checkOrder(run, sampleLesson);
    expect(text(view(wrong))).toMatch(/Not yet: \d of 4 are in the right place\./);
    let sorted = wrong;
    for (const id of ['ci-green', 'review', 'approve', 'merge']) {
      while (
        sorted.card.order.indexOf(id) > ['ci-green', 'review', 'approve', 'merge'].indexOf(id)
      ) {
        sorted = moveStep(sorted, sampleLesson, id, -1);
      }
    }
    expect(text(view(checkOrder(sorted, sampleLesson)))).toContain('Right order.');
  });

  it("shows a final's clock beside the progress", () => {
    expect(view(cards(sampleFinal), sampleFinal)).toContain('clock clock--boss');
    expect(view(cards())).not.toContain('clock clock--boss');
  });

  it('ends with stars and XP, or with Try again after a time-out', () => {
    const done: LessonRun = {
      ...cards(),
      phase: 'done',
      outcome: 'finished',
      firstTry: [true, true, true, true, true, true],
    };
    const markup = view(done, sampleLesson, 60);
    expect(markup).toContain('aria-label="3 of 3 stars"');
    expect(text(markup)).toContain('6 of 6 right on the first try.');
    expect(text(markup)).toContain('+60 XP');
    expect(text(view(done))).toContain('Replays practise without paying XP again.');

    const out = tickLesson(cards(sampleFinal), sampleFinal, T0 + 120_000);
    expect(text(view(out, sampleFinal))).toContain('Time’s up. You answered 0 of 6 cards.');
    expect(text(view(out, sampleFinal))).toContain('Try again');
  });
});
