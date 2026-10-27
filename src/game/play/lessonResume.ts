import {
  currentCard,
  finishLessonBriefing,
  scrambledOrder,
  startLessonRun,
  type CardState,
  type LessonRun,
} from '../missions/lessonRunner';
import { isPickCard, type Lesson, type LessonCard } from '../missions/lessonSchema';
import type { LessonResume, MissionProgress } from '../save/schema';

/*
 * Where an untimed lesson left partway picks up (DESIGN.md section 5, Lessons), as pure
 * functions: what the save keeps of a run, whether a kept one still fits the lesson, and
 * the run it turns back into. lessonPlay.ts saves and resumes with these, and the Act
 * menu reads the same answer, so a row says "In progress" exactly when Play resumes.
 */

/**
 * Whether a lesson can wait for Kyle to come back. A timed final can't: its clock would
 * either run on while he's away or hand him a pause the challenge doesn't have.
 */
export function lessonResumes(lesson: Lesson): boolean {
  return lesson.timeLimitSeconds === undefined;
}

/**
 * What the save keeps of a run: each answered card's first try, and the next card's wrong
 * tries, so a miss stays a miss after a reload.
 */
export function lessonResumeOf(run: LessonRun, lesson: Lesson): LessonResume {
  const answered = run.firstTry.flatMap((firstTry, index) => {
    const card = lesson.cards[index];
    return card === undefined ? [] : [{ cardId: card.id, firstTry }];
  });
  const card = currentCard(run, lesson);
  const { picked, wrongOrders, solved } = run.card;
  const missed = picked.length > 0 || wrongOrders > 0;
  const open =
    card === undefined || solved || !missed
      ? null
      : { cardId: card.id, picked: [...picked], wrongOrders };
  return { answered, open };
}

/**
 * The save's resume point for this lesson if Play can pick it up, or null when Play
 * starts at the briefing: a timed final, a lesson done or tested out (its row offers
 * Replay), nothing answered yet, or answers that no longer match the lesson's cards.
 */
export function lessonResumeFor(
  lesson: Lesson,
  saved: MissionProgress | undefined,
): LessonResume | null {
  const resume = saved?.lessonResume;
  if (resume === undefined || saved?.status !== 'in-progress' || !lessonResumes(lesson)) {
    return null;
  }
  const { answered, open } = resume;
  if (answered.length === 0 && open === null) return null;
  if (answered.length > lesson.cards.length) return null;
  const fits = answered.every((entry, index) => lesson.cards[index]?.id === entry.cardId);
  return fits ? resume : null;
}

/** The card a resumed lesson opens on, counted from 1: the first one not answered. */
export function resumeCardNumber(lesson: Lesson, resume: LessonResume): number {
  return Math.min(resume.answered.length, lesson.cards.length - 1) + 1;
}

/** An unanswered card as it was left, its wrong tries kept so they still count. */
function openCard(card: LessonCard, open: LessonResume['open']): CardState {
  const kept = open?.cardId === card.id ? open : null;
  if (!isPickCard(card)) {
    return {
      picked: [],
      order: scrambledOrder(card),
      wrongOrders: kept?.wrongOrders ?? 0,
      solved: false,
    };
  }
  const wrong = new Set(
    card.options.filter((option) => !option.correct).map((option) => option.id),
  );
  const picked = (kept?.picked ?? []).filter((id) => wrong.has(id));
  return { picked, order: [], wrongOrders: 0, solved: false };
}

/** The last card answered, waiting for Finish: shown right, with its explanation. */
function solvedCard(card: LessonCard): CardState {
  if (!isPickCard(card)) {
    return { picked: [], order: card.steps.map((step) => step.id), wrongOrders: 0, solved: true };
  }
  const right = card.options.find((option) => option.correct);
  return { picked: right === undefined ? [] : [right.id], order: [], wrongOrders: 0, solved: true };
}

/**
 * The run a kept resume point turns back into: past the briefing, at the first card not
 * answered, with every first try kept. When every card was answered and only Finish was
 * left, it opens on the last card, solved, so Finish completes the lesson.
 */
export function resumedLessonRun(lesson: Lesson, resume: LessonResume, nowMs: number): LessonRun {
  const run = finishLessonBriefing(startLessonRun(lesson), nowMs);
  const firstTry = resume.answered.map((entry) => entry.firstTry);
  const allAnswered = firstTry.length >= lesson.cards.length;
  const cardIndex = allAnswered ? lesson.cards.length - 1 : firstTry.length;
  const card = lesson.cards[cardIndex];
  if (card === undefined) return run;
  return {
    ...run,
    cardIndex,
    firstTry,
    card: allAnswered ? solvedCard(card) : openCard(card, resume.open),
  };
}
