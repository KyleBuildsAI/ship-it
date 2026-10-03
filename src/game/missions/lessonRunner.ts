import { isPickCard, type Lesson, type LessonCard, type OrderCard } from './lessonSchema';

/*
 * The rules of playing a lesson, as pure functions: each takes a run and returns a new
 * one, so they're unit tested without a browser or a save. lessonPlay.ts wires them to
 * the play store and the save.
 *
 * A card is answered by clicking. A wrong answer shows its feedback and the card stays
 * open to try again; only whether the FIRST try was right counts toward the stars, so
 * guessing your way through still teaches, but doesn't score.
 */

export type LessonPhase = 'briefing' | 'cards' | 'done';

/** How a run ended: every card answered, or a final's clock ran out first. */
export type LessonOutcome = 'running' | 'finished' | 'timed-out';

/** The card on screen now, and what has been tried on it. */
export interface CardState {
  /** Options picked so far on a pick card, wrong ones included, oldest first. */
  readonly picked: readonly string[];
  /** The steps as currently arranged on an order card, by id. */
  readonly order: readonly string[];
  /** How many times "Check order" was pressed with the steps out of order. */
  readonly wrongOrders: number;
  /** True once the right answer is in; the explanation shows and Next appears. */
  readonly solved: boolean;
}

export interface LessonRun {
  readonly phase: LessonPhase;
  readonly outcome: LessonOutcome;
  readonly cardIndex: number;
  readonly card: CardState;
  /** One entry per finished card, in order: whether its first try was right. */
  readonly firstTry: readonly boolean[];
  /** When the cards started. A final's shared clock counts from here. */
  readonly startedAtMs: number | null;
}

/**
 * The order an order card's steps are shown in: a scramble that's never already right.
 * It's the same every time for the same card, so a replay or a test sees the same puzzle.
 */
export function scrambledOrder(card: OrderCard): string[] {
  const ids = card.steps.map((step) => step.id);
  // A small hash of the card's id seeds the scramble, so different cards differ.
  let seed = 7;
  for (let index = 0; index < card.id.length; index++) {
    seed = (seed * 31 + card.id.charCodeAt(index)) >>> 0;
  }
  const next = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed;
  };
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index--) {
    swap(shuffled, index, next() % (index + 1));
  }
  // A scramble that lands on the answer would solve itself, so turn it one place instead.
  if (shuffled.every((id, index) => id === ids[index])) {
    const head = shuffled.shift();
    if (head !== undefined) shuffled.push(head);
  }
  return shuffled;
}

/** Swaps two places of a list in place. Out-of-range places leave it alone. */
function swap(list: string[], first: number, second: number): void {
  const a = list[first];
  const b = list[second];
  if (a === undefined || b === undefined) return;
  list[first] = b;
  list[second] = a;
}

function freshCard(card: LessonCard | undefined): CardState {
  return {
    picked: [],
    order: card?.kind === 'order' ? scrambledOrder(card) : [],
    wrongOrders: 0,
    solved: false,
  };
}

export function startLessonRun(lesson: Lesson): LessonRun {
  return {
    phase: 'briefing',
    outcome: 'running',
    cardIndex: 0,
    card: freshCard(lesson.cards[0]),
    firstTry: [],
    startedAtMs: null,
  };
}

/** Ends the briefing and starts the first card, and a final's clock with it. */
export function finishLessonBriefing(run: LessonRun, nowMs: number): LessonRun {
  if (run.phase !== 'briefing') return run;
  return { ...run, phase: 'cards', startedAtMs: nowMs };
}

export function currentCard(run: LessonRun, lesson: Lesson): LessonCard | undefined {
  return run.phase === 'cards' ? lesson.cards[run.cardIndex] : undefined;
}

function playable(run: LessonRun): boolean {
  return run.phase === 'cards' && run.outcome === 'running' && !run.card.solved;
}

/**
 * Picks an option on a choose or prompt card. A right pick solves the card; a wrong one
 * is remembered (its feedback shows, and it can't be picked again) and the card stays
 * open. The first pick decides the card's first-try result.
 */
export function pickOption(run: LessonRun, lesson: Lesson, optionId: string): LessonRun {
  const card = currentCard(run, lesson);
  if (card === undefined || !isPickCard(card) || !playable(run)) return run;
  const option = card.options.find((entry) => entry.id === optionId);
  if (option === undefined || run.card.picked.includes(optionId)) return run;
  const picked = [...run.card.picked, optionId];
  if (!option.correct) return { ...run, card: { ...run.card, picked } };
  return {
    ...run,
    card: { ...run.card, picked, solved: true },
    firstTry: [...run.firstTry, picked.length === 1],
  };
}

/** Moves one step of an order card up (-1) or down (+1). Off either end does nothing. */
export function moveStep(
  run: LessonRun,
  lesson: Lesson,
  stepId: string,
  direction: -1 | 1,
): LessonRun {
  const card = currentCard(run, lesson);
  if (card?.kind !== 'order' || !playable(run)) return run;
  const from = run.card.order.indexOf(stepId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= run.card.order.length) return run;
  const order = [...run.card.order];
  swap(order, from, to);
  return { ...run, card: { ...run.card, order } };
}

/** How many steps of an order card sit in their right place right now. */
export function stepsInPlace(run: LessonRun, card: OrderCard): number {
  return card.steps.filter((step, index) => run.card.order[index] === step.id).length;
}

/** "Check order": solves the card when every step is in place, or counts a wrong try. */
export function checkOrder(run: LessonRun, lesson: Lesson): LessonRun {
  const card = currentCard(run, lesson);
  if (card?.kind !== 'order' || !playable(run)) return run;
  if (stepsInPlace(run, card) < card.steps.length) {
    return { ...run, card: { ...run.card, wrongOrders: run.card.wrongOrders + 1 } };
  }
  return {
    ...run,
    card: { ...run.card, solved: true },
    firstTry: [...run.firstTry, run.card.wrongOrders === 0],
  };
}

/** After a solved card: the next card, or the Done screen after the last one. */
export function nextCard(run: LessonRun, lesson: Lesson): LessonRun {
  if (run.phase !== 'cards' || !run.card.solved) return run;
  const index = run.cardIndex + 1;
  if (index >= lesson.cards.length) return { ...run, phase: 'done', outcome: 'finished' };
  return { ...run, cardIndex: index, card: freshCard(lesson.cards[index]) };
}

/** Seconds left on a final's clock, or null for a lesson without one. */
export function lessonSecondsLeft(run: LessonRun, lesson: Lesson, nowMs: number): number | null {
  if (lesson.timeLimitSeconds === undefined) return null;
  if (run.startedAtMs === null) return lesson.timeLimitSeconds;
  // Clamped at both ends: a screen's clock can read a moment before the start time.
  const elapsed = Math.max(0, nowMs - run.startedAtMs) / 1000;
  return Math.max(0, lesson.timeLimitSeconds - elapsed);
}

/**
 * Runs a final's clock. When it hits zero before the last card is answered, the run ends
 * timed out: the cards still unanswered count as missed, and the lesson isn't completed.
 */
export function tickLesson(run: LessonRun, lesson: Lesson, nowMs: number): LessonRun {
  if (run.phase !== 'cards' || run.outcome !== 'running') return run;
  if (lessonSecondsLeft(run, lesson, nowMs) !== 0) return run;
  return { ...run, phase: 'done', outcome: 'timed-out' };
}

/** The share of cards right on the first try, 0 to 100. Unanswered cards count as missed. */
export function firstTryPercent(run: LessonRun, lesson: Lesson): number {
  const right = run.firstTry.filter(Boolean).length;
  return Math.round((right / lesson.cards.length) * 100);
}

/** Stars from a first-try percent: 3 for nearly flawless, 2 for solid, 1 for finishing. */
export function starsFor(percent: number): 1 | 2 | 3 {
  if (percent >= 90) return 3;
  if (percent >= 60) return 2;
  return 1;
}
