import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
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
import type { PlacementResult } from '../../game/missions/grading';
import { placementLesson } from '../../game/missions/lessonPlacement';
import { isPickCard, type Lesson } from '../../game/missions/lessonSchema';
import { sampleFinal, sampleLesson } from '../../game/missions/sample.test-lesson';
import { fullSampleLessonAct } from '../../game/missions/sample.test-lessonAct';
import { setCatalog } from '../../game/play/catalog';
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
    // The feedback opens "Yes:", so that is the verdict, never "Right. Yes:".
    expect(markup).toContain('<strong>Yes:</strong> the variable is seconds');
    expect(text(markup)).not.toContain('Right.');
    expect(text(markup)).toContain('Why Review the change, not the description.');
    expect(text(markup)).toContain('Next card');
  });

  it('says Right. before feedback that opens without a verdict of its own', () => {
    const second = nextCard(pickOption(cards(), sampleLesson, 'ask-units'), sampleLesson);
    expect(view(pickOption(second, sampleLesson, 'specific'))).toContain(
      '<strong>Right.</strong> It names the value',
    );
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

describe('a lesson Act’s placement test in the lesson view', () => {
  const full = fullSampleLessonAct();
  const lesson = placementLesson(full.act, full.lessons);
  beforeEach(() => {
    setCatalog({ acts: [full] });
  });
  const placementView = (run: LessonRun, result: PlacementResult | null) =>
    renderToStaticMarkup(
      <LessonView
        activity={{
          kind: 'lesson',
          lesson,
          run,
          xpEarned: 0,
          placement: { act: full.act.act, passPercent: 85, result },
        }}
      />,
    );

  it('calls its briefing a placement test, on one clock', () => {
    const markup = text(placementView(startLessonRun(lesson), null));
    expect(markup).toContain('Placement test');
    expect(markup).toContain('Every card shares one clock: 4:00.');
  });

  it('ends with the score and whether it tested out, never stars', () => {
    const done: LessonRun = { ...cards(lesson), phase: 'done', outcome: 'finished' };
    const passed = text(placementView(done, { percent: 100, testedOut: true }));
    expect(passed).toContain('100% right.');
    expect(passed).toContain('Tested out. Every lesson in Act 6 is marked done');
    // The sample Act has a Field Mission, which a test-out doesn't skip.
    expect(passed).toContain('the final and the Field Mission are still yours to do');
    expect(passed).not.toContain('★');
    const missed = text(placementView(done, { percent: 67, testedOut: false }));
    expect(missed).toContain('85% tests out. Play the lessons, or try again.');
    expect(missed).toContain('Try again');
  });

  it('says how many cards were answered when the clock ran out', () => {
    const out = tickLesson(cards(lesson), lesson, T0 + 240_000);
    expect(text(placementView(out, { percent: 0, testedOut: false }))).toContain(
      '0% right before time ran out (0 of 6 answered).',
    );
    // Until the result is saved, the Done screen waits rather than guessing.
    expect(text(placementView(out, null))).not.toContain('% right');
  });

  it('locks a card on its answer, and shows no feedback, colour or why', () => {
    const picks: Lesson = { ...lesson, cards: lesson.cards.filter(isPickCard) };
    const card = picks.cards[0];
    if (card === undefined || !isPickCard(card)) throw new Error('expected a pick card');
    const wrong = card.options.find((option) => !option.correct);
    if (wrong === undefined) throw new Error('expected a wrong option');
    const locked = finishLessonBriefing(startLessonRun(picks, { locked: true }), T0);
    const markup = renderToStaticMarkup(
      <LessonView
        activity={{
          kind: 'lesson',
          lesson: picks,
          run: pickOption(locked, picks, wrong.id),
          xpEarned: 0,
          placement: { act: full.act.act, passPercent: 85, result: null },
        }}
      />,
    );
    expect(text(markup)).toContain('Answer locked in. Your score comes at the end.');
    expect(text(markup)).not.toContain('Not quite');
    expect(text(markup)).not.toContain(text(wrong.feedback));
    expect(text(markup)).not.toContain(text(card.explanation));
    expect(markup).not.toContain('lesson-option--wrong');
    expect(markup).not.toContain('lesson-option--right');
    expect(markup).toContain('lesson-option--chosen');
    expect(text(markup)).toContain('Next card');
  });
});
