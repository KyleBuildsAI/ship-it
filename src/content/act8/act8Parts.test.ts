import { describe, expect, it } from 'vitest';
import { placementLesson } from '../../game/missions/lessonPlacement';
import {
  requireFieldMission,
  requireLessonPlacement,
  type FieldMission,
} from '../../game/missions/schema';
import { verifyPaste } from '../../game/play/fieldCheck';
import { roadmapAct } from '../roadmap';
import { STORY_HEADINGS, STORY_PATH } from './fieldMission';
import { act8 } from './index';
import { act8PlacementCards } from './placement';

const { act, lessons } = act8;
const field = requireFieldMission(act);
const placement = requireLessonPlacement(act);
const playedLessons = lessons.filter((lesson) => lesson.id !== act.finalLessonId);

/** One of the Field Mission's paste checks, by id, so a test reads like the mission does. */
function verification(id: string): FieldMission['verifications'][number] {
  const found = field.verifications.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No verification "${id}".`);
  return found;
}

/** Every word the Field Mission puts on screen. */
function fieldText(): string {
  return [
    ...field.briefing,
    ...field.checklist.map((item) => item.text),
    ...field.verifications.flatMap((check) => [check.instruction, check.command]),
  ].join(' ');
}

describe('Act 8 is a finished Act', () => {
  it('has a placement test, its final as the boss, and a Field Mission', () => {
    expect(act.earlyAccess).toBe(false);
    expect(act.finalLessonId).toBe('the-mock-loop');
    expect(act.placementTest).toBeDefined();
    expect(act.fieldMission?.id).toBe('tell-the-sandcastles-story');
  });

  it('is on the roadmap as playable, with its Field Mission named', () => {
    const entry = roadmapAct(8);
    expect(entry?.stage).toBe('playable');
    expect(entry?.fieldMission?.title).toBe(field.title);
    expect(entry?.status).toContain('placement test');
    expect(entry?.status).toContain('Field Mission');
  });
});

describe('Act 8 placement test', () => {
  it('borrows two or three cards from every lesson, and none from the final', () => {
    expect(Object.keys(act8PlacementCards)).toEqual(playedLessons.map((lesson) => lesson.id));
    for (const lesson of playedLessons) {
      const borrowed = placement.cardIds.filter((id) =>
        lesson.cards.some((card) => card.id === id),
      );
      expect(borrowed.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(borrowed.length, lesson.id).toBeLessThanOrEqual(3);
    }
    const final = lessons.find((lesson) => lesson.id === act.finalLessonId);
    const finalIds = final?.cards.map((card) => card.id) ?? [];
    for (const id of placement.cardIds) expect(finalIds).not.toContain(id);
  });

  it('names each card in the lesson it is listed under, and in no other lesson', () => {
    // The placement finds a card by id across every lesson, so a shared id would ask the
    // wrong lesson's card.
    for (const [lessonId, ids] of Object.entries(act8PlacementCards)) {
      for (const id of ids) {
        const owners = playedLessons.filter((lesson) =>
          lesson.cards.some((card) => card.id === id),
        );
        expect(owners.map((lesson) => lesson.id)).toEqual([lessonId]);
      }
    }
  });

  it('asks about directing Otto in every lesson it borrows from', () => {
    for (const lesson of playedLessons) {
      const kinds = lesson.cards
        .filter((card) => placement.cardIds.includes(card.id))
        .map((card) => card.kind);
      expect(kinds, lesson.id).toContain('prompt');
    }
  });

  it('plays as one clocked run at the final’s pace of 40 seconds a card', () => {
    const run = placementLesson(act, lessons);
    expect(run.cards.map((card) => card.id)).toEqual(placement.cardIds);
    expect(run.kind).toBe('final');
    expect(placement.timeLimitSeconds / placement.cardIds.length).toBe(40);
    expect(placement.passPercent).toBe(85);
  });
});

describe('Act 8 Field Mission: Tell the SandCastles Story', () => {
  it('happens on the real SandCastles repo, in STAR shape, with Kyle directing his agent', () => {
    expect(field.repoName).toBe('SandCastles');
    const text = fieldText();
    expect(text).toContain(STORY_PATH);
    expect(text).toMatch(/AI agent/);
    const brief = field.checklist.find((item) => item.id === 'brief-your-agent')?.text ?? '';
    // The headings are listed in STAR order, so what Kyle asks for is what he checks.
    const places = STORY_HEADINGS.map((heading) => brief.indexOf(heading));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  it('never asks for a GitHub token or API key, and runs in plain PowerShell', () => {
    expect(fieldText()).not.toMatch(/token|api key|ghp_/i);
    for (const check of field.verifications) {
      // Windows PowerShell can drop a bare `--`, so no command depends on one.
      expect(check.command.split(' '), check.id).not.toContain('--');
    }
  });

  it('passes when the story is committed with a Conventional message', () => {
    const verdict = verifyPaste(
      verification('story-committed'),
      'a1b2c3d (HEAD -> main) docs: add the SandCastles project story',
    );
    expect(verdict.passed).toBe(true);
  });

  it('fails while the story is missing, uncommitted, or committed with a vague message', () => {
    const check = verification('story-committed');
    expect(verifyPaste(check, '').passed).toBe(false);
    expect(
      verifyPaste(
        check,
        "fatal: ambiguous argument 'docs/story.md': unknown revision or path not in the working tree.",
      ).passed,
    ).toBe(false);
    expect(verifyPaste(check, 'a1b2c3d update files').passed).toBe(false);
  });

  it('passes only on a clean tree, so nothing the agent wrote is left behind', () => {
    const check = verification('story-tree-clean');
    const clean = [
      'On branch main',
      "Your branch is up to date with 'origin/main'.",
      '',
      'nothing to commit, working tree clean',
    ].join('\n');
    const dirty = [
      'On branch main',
      'Untracked files:',
      '  (use "git add <file>..." to include in what will be committed)',
      '\tdocs/story.md',
      '',
      'nothing added to commit but untracked files present (use "git add" to track)',
    ].join('\n');
    expect(verifyPaste(check, clean).passed).toBe(true);
    expect(verifyPaste(check, dirty).passed).toBe(false);
  });
});
