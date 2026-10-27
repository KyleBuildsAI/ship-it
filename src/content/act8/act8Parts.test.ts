import { describe, expect, it } from 'vitest';
import { bestLengthStrategy, placementLesson } from '../../game/missions/lessonPlacement';
import {
  requireFieldMission,
  requireLessonPlacement,
  type FieldMission,
} from '../../game/missions/schema';
import { verifyPaste } from '../../game/play/fieldCheck';
import { roadmapAct } from '../roadmap';
import { STORY_FILES, STORY_HEADINGS, STORY_PATH } from './fieldMission';
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
    ...field.checklist.flatMap((item) => [item.text, item.prompt ?? '']),
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

  it('can’t be passed by picking options by their length', () => {
    // A placement shows no feedback, so length is the only clue left. The best rule that
    // never reads a card must stay far below the 85% that tests out.
    const run = placementLesson(act, lessons);
    const best = bestLengthStrategy(run.cards);
    expect(best?.right ?? 0).toBeLessThanOrEqual(Math.floor(run.cards.length / 3));
  });

  it('asks only cards that make sense without the lesson card before them', () => {
    // draft-reply answers with Brightline's log and its 5,000 calls, which only the card
    // before it shows, and an order card's one locked try punishes a defensible order.
    expect(placement.cardIds).not.toContain('draft-reply');
    const run = placementLesson(act, lessons);
    expect(run.cards.map((card) => card.kind)).not.toContain('order');
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
    const brief = field.checklist.find((item) => item.id === 'brief-your-agent')?.prompt ?? '';
    // The headings are listed in STAR order, so what Kyle asks for is what he checks.
    const places = STORY_HEADINGS.map((heading) => brief.indexOf(heading));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  it('never asks for a GitHub token or API key, and runs in plain PowerShell', () => {
    expect(fieldText()).not.toMatch(/token|api key|ghp_/i);
    for (const check of field.verifications) {
      expect(check.command, check.id).toMatch(/^git /);
      // PowerShell has no grep, head or tail; Select-String does that job.
      expect(check.command, check.id).not.toMatch(/\|\s*(grep|head|tail)\b/);
    }
  });

  it('logs the story with --, so a story not on this branch prints nothing, not an error', () => {
    // Without --, git stops with "ambiguous argument" when docs/story.md isn't in the folder.
    expect(verification('story-committed').command).toBe(`git log --oneline -1 -- ${STORY_PATH}`);
    const notPulled = [
      "fatal: ambiguous argument 'docs/story.md': unknown revision or path not in the working tree.",
      "Use '--' to separate paths from revisions, like this:",
      "'git <command> [<revision>...] -- [<file>...]'",
    ].join('\n');
    const verdict = verifyPaste(verification('story-committed'), notPulled);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain("Git can't find docs/story.md here");
    expect(verdict.message).toContain('git switch main and git pull');
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

  it('says what an empty log means: nothing on this branch has committed the story yet', () => {
    const verdict = verifyPaste(verification('story-committed'), '');
    expect(verdict.message).toContain('no commit on this branch has touched docs/story.md');
    expect(verdict.message).toContain('git switch main and git pull');
    expect(verification('story-committed').instruction).toContain('Any Conventional message');
  });

  it('reads the committed story’s headings and wants all five, in STAR order', () => {
    const check = verification('story-headings');
    expect(check.command).toBe("git show HEAD:docs/story.md | Select-String '^## '");
    const star = ['', ...STORY_HEADINGS.map((heading) => `## ${heading}`), ''].join('\r\n');
    expect(verifyPaste(check, star).passed).toBe(true);
    const shuffled = ['## Situation', '## Action', '## Task', '## Result'].join('\n');
    expect(verifyPaste(check, shuffled).passed).toBe(false);
    const missing = verifyPaste(check, ['## Situation', '## Task'].join('\n'));
    expect(missing.message).toContain('Missing: Action, Result, What I would do differently');
    const notCommitted = "fatal: path 'docs/story.md' does not exist in 'HEAD'";
    expect(verifyPaste(check, notCommitted).passed).toBe(false);
  });

  it('checks the story and README are tracked, and no secret is, in what may be public', () => {
    const check = verification('story-tracked');
    const files = ['.gitignore', 'README.md', 'docs/story.md', 'src/main.ts'];
    expect(verifyPaste(check, files.join('\n')).passed).toBe(true);
    const noStory = verifyPaste(check, ['README.md', 'src/main.ts'].join('\n'));
    expect(noStory.passed).toBe(false);
    expect(noStory.message).toContain('docs/story.md');
    const withEnv = verifyPaste(check, [...files, '.env'].join('\n'));
    expect(withEnv.passed).toBe(false);
    expect(withEnv.message).toContain('.env');
  });

  it('looks only at the story and README, so other work in progress is left alone', () => {
    const check = verification('story-files-clean');
    expect(check.command).toBe(`git status --short ${STORY_FILES.join(' ')}`);
    // Scoped to two committed files, git prints nothing, and nothing is the clean answer.
    expect(verifyPaste(check, '').passed).toBe(true);
    expect(verifyPaste(check, `PS C:\\SandCastles> ${check.command}`).passed).toBe(true);
    // Run unscoped by mistake, other files' changes still don't count against the story.
    expect(verifyPaste(check, ' M src/app.ts\n?? notes.txt').passed).toBe(true);
    const dirty = verifyPaste(check, ' M README.md\n?? docs/story.md');
    expect(dirty.passed).toBe(false);
    expect(dirty.message).toContain('README.md, docs/story.md');
  });

  it('warns that the story may be public, and keeps the agent off other files', () => {
    const tasks = field.checklist.map((item) => `${item.text} ${item.prompt ?? ''}`).join(' ');
    expect(tasks).toMatch(/public/);
    expect(tasks).toMatch(/passwords/);
    const commit = field.checklist.find((item) => item.id === 'commit-it');
    expect(commit?.prompt).toMatch(/Commit only those two files/);
    expect(commit?.prompt).toMatch(/stash/);
    // The workflow Act 3 taught: a branch and a squash-merged pull request.
    expect(commit?.prompt).toMatch(/branch called docs\/story/);
    expect(commit?.prompt).toMatch(/squash-merge/);
  });
});
