import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_MAX_LINES,
  LessonSchema,
  isPickCard,
  type Lesson,
  type LessonCard,
} from '../../game/missions/lessonSchema';
import { countWords } from '../../game/missions/schemaParts';
import { validateAct } from '../../game/missions/validateAct';
import { beatsForAct } from '../../game/world/beats';
import { act3, act3Lessons, act3Placement } from './index';

/*
 * Act 3's content checks. The schema already holds every word budget; these tests hold
 * the shape the Act promises: four lessons and a timed final, each lesson mixing card
 * kinds, and enough "what do you tell Otto?" cards that the Act is about directing an
 * agent, not typing git commands.
 */

const lessons = act3.lessons;
const regular = lessons.filter((lesson) => lesson.kind === 'lesson');
const final = lessons.at(-1);

function countKind(lesson: Lesson, kind: Lesson['cards'][number]['kind']): number {
  return lesson.cards.filter((card) => card.kind === kind).length;
}

/** Every piece of text a card puts on screen, for the checks that read all of it. */
function cardTexts(card: LessonCard): string[] {
  const parts = [card.situation, card.question, card.explanation];
  if (card.artifact) parts.push(card.artifact.text);
  if (isPickCard(card)) {
    parts.push(...card.options.flatMap((option) => [option.text, option.feedback]));
  } else {
    parts.push(...card.steps.map((step) => step.text));
  }
  return parts;
}

describe('Act 3: Branching', () => {
  it('parses every lesson input without an error', () => {
    for (const input of act3Lessons) {
      expect(LessonSchema.safeParse(input).error).toBeUndefined();
    }
  });

  it('is a valid, finished Act with its final named', () => {
    expect(act3.act.title).toBe('Branching');
    expect(act3.act.earlyAccess).toBe(false);
    expect(act3.act.finalLessonId).toBe('conflict-storm');
    expect(validateAct(act3.act, [], lessons)).toEqual([]);
  });

  it('plays four lessons, then the Conflict Storm final', () => {
    expect(lessons.map((lesson) => lesson.kind)).toEqual([
      'lesson',
      'lesson',
      'lesson',
      'lesson',
      'final',
    ]);
    expect(final?.title).toBe('Conflict Storm');
    expect(act3.act.missionIds).toEqual(lessons.map((lesson) => lesson.id));
  });

  it('gives each lesson 7 to 9 cards and the final 8 to 10', () => {
    for (const lesson of regular) {
      expect(lesson.cards.length).toBeGreaterThanOrEqual(7);
      expect(lesson.cards.length).toBeLessThanOrEqual(9);
    }
    expect(final?.cards.length).toBeGreaterThanOrEqual(8);
    expect(final?.cards.length).toBeLessThanOrEqual(10);
  });

  it('times the final at four to six minutes, never under 40 seconds a card', () => {
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
    expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
  });

  it('asks what to tell Otto at least twice, and has an order card, in every lesson', () => {
    for (const lesson of lessons) {
      expect(countKind(lesson, 'prompt'), lesson.id).toBeGreaterThanOrEqual(2);
      expect(countKind(lesson, 'order'), lesson.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses ids that are unique across lessons, cards, options and steps', () => {
    const lessonIds = lessons.map((lesson) => lesson.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    for (const lesson of lessons) {
      const cardIds = lesson.cards.map((card) => card.id);
      expect(new Set(cardIds).size, lesson.id).toBe(cardIds.length);
      for (const card of lesson.cards) {
        const ids = isPickCard(card)
          ? card.options.map((option) => option.id)
          : card.steps.map((step) => step.id);
        expect(new Set(ids).size, `${lesson.id} > ${card.id}`).toBe(ids.length);
      }
    }
  });

  it('has exactly one right answer on every pick card', () => {
    // Every Act 3 card has one best move. Two right answers would blur the principle.
    for (const card of lessons.flatMap((lesson) => lesson.cards)) {
      if (!isPickCard(card)) continue;
      expect(
        card.options.filter((option) => option.correct),
        card.id,
      ).toHaveLength(1);
    }
  });

  it('never lets the longest option give the answer away', () => {
    // If the right option were always the most detailed, picking the longest would pass
    // the Act without judging anything. So every prompt card has a detailed but flawed
    // instruction nearly as long as the right one, and across all pick cards the right
    // answer is the longest on at most half.
    const pickCards = lessons.flatMap((lesson) => lesson.cards).filter(isPickCard);
    let rightIsLongest = 0;
    for (const card of pickCards) {
      const right = card.options.find((option) => option.correct);
      const rightWords = countWords(right?.text ?? '');
      const longestWrong = Math.max(
        ...card.options
          .filter((option) => !option.correct)
          .map((option) => countWords(option.text)),
      );
      if (rightWords > longestWrong) rightIsLongest++;
      if (card.kind === 'prompt') {
        expect(longestWrong / rightWords, card.id).toBeGreaterThanOrEqual(0.75);
      }
    }
    expect(rightIsLongest / pickCards.length).toBeLessThanOrEqual(0.5);
  });

  it('never says a pull request merges as a fast-forward', () => {
    // Quillwork is on GitHub, and none of GitHub's merge buttons fast-forward: even
    // Rebase and merge writes new commits. Only a local git merge can.
    const prFastForward = /\b(?:PRs?|pull requests?)\b[^.:]*\bfast-forward/i;
    for (const card of lessons.flatMap((lesson) => lesson.cards)) {
      for (const text of cardTexts(card)) expect(text, card.id).not.toMatch(prFastForward);
    }
  });

  it('keeps artifacts short and labelled', () => {
    for (const card of lessons.flatMap((lesson) => lesson.cards)) {
      if (card.artifact === undefined) continue;
      expect(card.artifact.label, card.id).toBeDefined();
      expect(card.artifact.text.split('\n').length).toBeLessThanOrEqual(ARTIFACT_MAX_LINES);
    }
  });

  it('gives a commit id one meaning across every card', () => {
    // Lesson 3.2 teaches that an id is a fixed fingerprint, so the Act's own logs must
    // never show one id on two different commits. (One message under two ids is fine:
    // that's exactly what a rebase does.)
    const commitLine = /^[*|/\s]*([0-9a-f]{7}) (?:\([^)]*\) )?(.+)$/;
    const meaning = new Map<string, string>();
    for (const card of lessons.flatMap((lesson) => lesson.cards)) {
      for (const line of card.artifact?.text.split('\n') ?? []) {
        const match = commitLine.exec(line);
        const id = match?.[1];
        const message = match?.[2];
        if (id === undefined || message === undefined) continue;
        expect(meaning.get(id) ?? message, `${card.id}: ${id}`).toBe(message);
        meaning.set(id, message);
      }
    }
    expect(meaning.size).toBeGreaterThan(10);
  });

  it('is complete with every part: placement test, final as boss, Field Mission', () => {
    expect(act3.act.placementTest).toEqual({ ...act3Placement, passPercent: 85 });
    expect(act3.act.fieldMission?.id).toBe('land-a-real-branch');
    expect(act3.act.boss).toBeUndefined();
  });

  it('happens at Quillwork, with Otto and the team', () => {
    const text = JSON.stringify(act3Lessons);
    for (const name of ['Quillwork', 'Otto', 'Sage', 'Priya', 'Marco', 'Dex']) {
      expect(text).toContain(name);
    }
  });

  it('acts out most cards on the island, naming only beats it knows', () => {
    const known = beatsForAct(3);
    const cards = lessons.flatMap((lesson) => lesson.cards);
    for (const lesson of lessons) {
      if (lesson.briefingBeat !== undefined) expect(known).toContain(lesson.briefingBeat);
    }
    for (const card of cards) {
      if (card.beat !== undefined) expect(known).toContain(card.beat);
    }
    const withBeat = cards.filter((card) => card.beat !== undefined).length;
    expect(withBeat / cards.length).toBeGreaterThanOrEqual(0.8);
    // Every beat the island has is used somewhere, or it's dead weight.
    const used = new Set(cards.map((card) => card.beat));
    for (const beat of known) expect(used).toContain(beat);
  });

  it('opens Tools for Bad Days on the stuck fix, not on the cherry-pick that answers it', () => {
    // A briefing's scene plays before any question (DESIGN.md, Lesson scenes). The
    // cherry-pick scene copies the fix onto main, the answer to the first card.
    const badDays = lessons.find((lesson) => lesson.id === 'tools-for-bad-days');
    const firstCard = badDays?.cards[0];
    expect(firstCard?.question).toBe('How do you get just the fix to main?');
    expect(firstCard?.beat).toBe('cherry-pick');
    expect(badDays?.briefingBeat).not.toBe(firstCard?.beat);
  });
});
