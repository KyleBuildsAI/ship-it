import { describe, expect, it } from 'vitest';
import {
  isPickCard,
  LessonSchema,
  type Lesson,
  type LessonCard,
} from '../../game/missions/lessonSchema';
import { placementLesson } from '../../game/missions/lessonPlacement';
import { LESSON_PLACEMENT_SECONDS_PER_CARD } from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { verifyPaste, type Verification } from '../../game/play/fieldCheck';
import { beatsForAct } from '../../game/world/beats';
import { completeLesson, recordFieldMission, recordPlacement } from '../../game/play/saveRules';
import { placementTestOutXp } from '../../game/progression/xp';
import { createDefaultSave } from '../../game/save/schema';
import { act7, act7Lessons, act7Placement, specThenShip } from '.';

const { act, lessons } = act7;
const regular = lessons.filter((lesson) => lesson.kind === 'lesson');
const final = lessons.at(-1);

function countKind(lesson: Lesson, kind: LessonCard['kind']): number {
  return lesson.cards.filter((card) => card.kind === kind).length;
}

describe('Act 7: AI-Native Engineering', () => {
  it('parses every lesson, with any problem named by its field', () => {
    // act7 already parsed them; safeParse here turns a failure into a readable list.
    for (const input of act7Lessons) {
      const result = LessonSchema.safeParse(input);
      const problems = result.success
        ? []
        : result.error.issues.map((issue) => `${input.id}: ${issue.path.join('.')}`);
      expect(problems).toEqual([]);
    }
  });

  it('is ready to ship: the Act and its lessons agree', () => {
    expect(act.act).toBe(7);
    expect(act.title).toBe('AI-Native Engineering');
    expect(validateAct(act, [], lessons)).toEqual([]);
  });

  it('has four lessons, then the timed final named for the boss', () => {
    expect(lessons.map((lesson) => lesson.kind)).toEqual([
      'lesson',
      'lesson',
      'lesson',
      'lesson',
      'final',
    ]);
    expect(final?.title).toBe('The Agent Went Rogue');
    expect(act.finalLessonId).toBe(final?.id);
  });

  it('keeps each lesson to its card budget', () => {
    for (const lesson of regular) {
      expect(lesson.cards.length).toBeGreaterThanOrEqual(7);
      expect(lesson.cards.length).toBeLessThanOrEqual(9);
    }
    expect(final?.cards.length).toBeGreaterThanOrEqual(8);
    expect(final?.cards.length).toBeLessThanOrEqual(10);
  });

  it('gives the final a fair clock: four to six minutes, at least 40 seconds a card', () => {
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
    expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
  });

  it('pays more for the final than for any lesson', () => {
    const most = Math.max(...regular.map((lesson) => lesson.xp));
    expect(final?.xp).toBeGreaterThan(most);
  });

  it('uses ids no other lesson or card shares', () => {
    const lessonIds = lessons.map((lesson) => lesson.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    for (const lesson of lessons) {
      const cardIds = lesson.cards.map((card) => card.id);
      expect(new Set(cardIds).size, lesson.id).toBe(cardIds.length);
    }
  });

  it('has a right answer, and a plausible wrong one, on every pick card', () => {
    for (const lesson of lessons) {
      for (const card of lesson.cards.filter(isPickCard)) {
        const where = `${lesson.id} > ${card.id}`;
        expect(
          card.options.some((option) => option.correct),
          where,
        ).toBe(true);
        expect(
          card.options.some((option) => !option.correct),
          where,
        ).toBe(true);
      }
    }
  });

  it('asks what Kyle would tell Otto at least twice a lesson, and has an order card in each', () => {
    // The Act is about directing an agent, so every lesson makes Kyle choose a prompt.
    for (const lesson of lessons) {
      expect(countKind(lesson, 'prompt'), lesson.id).toBeGreaterThanOrEqual(2);
      expect(countKind(lesson, 'order'), lesson.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('makes the longest option wrong on at least one card a lesson', () => {
    // If the right answer were always the longest, Kyle could pick by length without reading.
    for (const lesson of lessons) {
      const longestIsWrong = lesson.cards.filter(isPickCard).some((card) => {
        const longest = card.options.reduce((best, option) =>
          option.text.length > best.text.length ? option : best,
        );
        return !longest.correct;
      });
      expect(longestIsWrong, lesson.id).toBe(true);
    }
  });

  it('gives the leaked-key response only one defensible order', () => {
    // The key is live, so revoking it (and checking what it did) comes first. A new key
    // put in while the debug line still prints would leak into the same logs, so the line
    // comes out before the new key goes in. A separate "check the logs" step could sit
    // anywhere after the revoke, which made two orders right.
    const card = lessons.flatMap((lesson) => lesson.cards).find((each) => each.id === 'leaked-key');
    if (card?.kind !== 'order') throw new Error('7.4 needs its leaked-key order card');
    const place = (pattern: RegExp) => card.steps.findIndex((step) => pattern.test(step.text));
    expect(card.steps[0]?.text).toMatch(/^Revoke the key .*check its logs/);
    expect(place(/Remove the line/)).toBe(1);
    expect(place(/new key/)).toBeGreaterThan(place(/Remove the line/));
    // ...which holds only while the line keeps printing, so the card has to say it does.
    expect(card.situation).toMatch(/every time/);
  });

  it('shows real artifacts to read, not just questions', () => {
    const kinds = new Set(
      lessons.flatMap((lesson) => lesson.cards.flatMap((card) => card.artifact?.kind ?? [])),
    );
    for (const kind of ['diff', 'log', 'terminal', 'pull-request', 'agent-message'] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
  });

  it('starts with the lesson the Act 7 island points to', () => {
    // src/game/world/zones.ts tells the player to start with 7.1 Brief the Agent.
    expect(lessons[0]?.title).toBe('Brief the Agent');
  });
});

const NOW = new Date('2026-10-13T12:00:00.000Z');

describe('Act 7 placement test', () => {
  it('is a finished Act with its placement test and Field Mission, not early access', () => {
    expect(act.earlyAccess).toBe(false);
    expect(act.placementTest).toBeDefined();
    expect(act.fieldMission?.id).toBe(specThenShip.id);
  });

  it('borrows two or three cards from every lesson, and none from the final', () => {
    for (const lesson of regular) {
      const ids = new Set(lesson.cards.map((card) => card.id));
      const lent = act7Placement.cardIds.filter((id) => ids.has(id)).length;
      expect(lent, lesson.id).toBeGreaterThanOrEqual(2);
      expect(lent, lesson.id).toBeLessThanOrEqual(3);
    }
    const finalIds = new Set(final?.cards.map((card) => card.id));
    expect(act7Placement.cardIds.filter((id) => finalIds.has(id))).toEqual([]);
  });

  it('gives every card at least the placement minimum on its clock', () => {
    const perCard = act7Placement.timeLimitSeconds / act7Placement.cardIds.length;
    expect(perCard).toBeGreaterThanOrEqual(LESSON_PLACEMENT_SECONDS_PER_CARD);
  });

  it('cannot be passed by always picking the longest answer', () => {
    // A placement shows no feedback, so length is the only tell a guesser has. Each card
    // needs a wrong option close in length to the right one, and across the test, the
    // longest option must be wrong often enough that picking it fails.
    const cards = placementLesson(act, lessons).cards.filter(isPickCard);
    let longestRight = 0;
    for (const card of cards) {
      const right = card.options.find((option) => option.correct)?.text.length ?? 0;
      const longestWrong = Math.max(
        ...card.options.filter((option) => !option.correct).map((option) => option.text.length),
      );
      expect(right, card.id).toBeLessThanOrEqual(longestWrong * 1.3);
      if (right > longestWrong) longestRight += 1;
    }
    expect(cards.length).toBe(act7Placement.cardIds.length);
    expect(longestRight).toBeLessThanOrEqual(cards.length / 2);
  });

  it('says in misses, not just percent, how strict the pass mark is', () => {
    // 85% of 12 is 11 right, so one miss: stricter than "85%" sounds.
    const run = placementLesson(act, lessons);
    expect(run.briefing.join(' ')).toContain('miss at most one of 12');
    expect(act7Placement.pitch).toContain('Miss at most one');
  });

  it('plays as one clocked run of the borrowed cards, in the order listed', () => {
    const run = placementLesson(act, lessons);
    expect(run.cards.map((card) => card.id)).toEqual(act7Placement.cardIds);
    expect(run.timeLimitSeconds).toBe(act7Placement.timeLimitSeconds);
  });

  it('tests out of every lesson at half XP, and leaves the final and Field Mission open', () => {
    const save = recordPlacement(
      createDefaultSave(NOW),
      act,
      lessons,
      { percent: 100, testedOut: true },
      NOW,
    );
    for (const lesson of regular) expect(save.missions[lesson.id]?.status).toBe('tested-out');
    expect(save.missions[final?.id ?? '']).toBeUndefined();
    // Cards can be guessed; the Field Mission is the real agent practice, so it still counts.
    expect(save.acts['7']?.completedAt).toBeNull();
    const half = regular.reduce((total, lesson) => total + placementTestOutXp([lesson.xp]), 0);
    expect(save.profile.xp).toBe(half);
    const ids = act.fieldMission?.verifications.map((check) => check.id) ?? [];
    const verified = recordFieldMission(save, act, ids, NOW);
    expect(verified.acts['7']?.completedAt).toBe(NOW.toISOString());
  });
});

/** Genuine-shaped PowerShell output for each check, as Kyle would paste it after a squash merge. */
const PASSING_PASTES: Record<string, string> = {
  'spec-on-main': 'docs/specs/tide-alerts.md',
  'spec-landed-by-pr': 'a1b2c3d (HEAD -> main, origin/main) feat: add tide alerts (#14)',
  'agent-commits-conventional': 'a1b2c3d (HEAD -> main, origin/main) feat: add tide alerts (#14)',
  'nothing-left-behind': [
    'On branch main',
    "Your branch is up to date with 'origin/main'.",
    '',
    'nothing to commit, working tree clean',
  ].join('\n'),
  'agent-kept-secrets-out': ['.env.example', '.gitignore', 'docs/specs/tide-alerts.md'].join('\n'),
};

function verificationOf(id: string): Verification {
  const found = act.fieldMission?.verifications.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No check ${id}`);
  return found;
}

describe('Act 7 Field Mission: Spec It, Then Ship It', () => {
  const field = act.fieldMission;

  it('happens on SandCastles, with a spec that has the four parts an agent needs', () => {
    expect(field?.repoName).toBe('SandCastles');
    const spec = field?.checklist.find((item) => item.id === 'spec')?.text ?? '';
    for (const part of ['docs/specs/', 'Goal', 'Constraints', 'Done means', 'How to verify']) {
      expect(spec, part).toContain(part);
    }
  });

  it('tells Kyle the game sees commits, not the PR page, so linking the spec is his job', () => {
    // The panel itself says no token is needed (FieldView), so the briefing doesn't repeat it.
    const briefing = field?.briefing.join(' ') ?? '';
    expect(briefing).toContain('not the PR page');
    expect(field?.checklist.some((item) => item.text.includes('PR'))).toBe(true);
  });

  it('passes every check on output from a merged spec PR', () => {
    for (const verification of field?.verifications ?? []) {
      const verdict = verifyPaste(verification, PASSING_PASTES[verification.id] ?? '');
      expect(verdict, verification.id).toMatchObject({ passed: true });
    }
  });

  it('passes a merge commit too: first-parent history shows GitHub’s merge', () => {
    const merged = 'f00ba47 (HEAD -> main) Merge pull request #14 from kyle/feat-tide-alerts';
    expect(verifyPaste(verificationOf('spec-landed-by-pr'), merged).passed).toBe(true);
    // Without --first-parent, git shows the agent's own commit on the branch.
    const branchCommit = '9f8e7d6 docs: add tide alerts spec';
    expect(verifyPaste(verificationOf('agent-commits-conventional'), branchCommit).passed).toBe(
      true,
    );
  });

  it('says no spec is on main yet, not "paste it first", when a spec log prints nothing', () => {
    for (const id of ['spec-on-main', 'spec-landed-by-pr', 'agent-commits-conventional']) {
      const verdict = verifyPaste(verificationOf(id), '');
      expect(verdict.passed, id).toBe(false);
      expect(verdict.message, id).toContain('no spec is on main yet');
      expect(verdict.message, id).toContain('git pull');
    }
  });

  it('fails a spec pushed straight to main, without a PR', () => {
    const direct = 'a1b2c3d (HEAD -> main) docs: add tide alerts spec';
    const verdict = verifyPaste(verificationOf('spec-landed-by-pr'), direct);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('through a PR');
  });

  it('fails a squash merge with a plain PR title, and says to fix the next title', () => {
    const plain = 'a1b2c3d (HEAD -> main) Add tide alerts (#14)';
    const verdict = verifyPaste(verificationOf('agent-commits-conventional'), plain);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('next PR’s title');
    expect(verdict.message).not.toContain('keep going');
    const pr = field?.checklist.find((item) => item.id === 'pr')?.text ?? '';
    expect(pr).toContain('Conventional title');
  });

  it('judges only the spec’s own commit, so old history neither passes nor fails it', () => {
    const conventional = verificationOf('agent-commits-conventional');
    expect(conventional.command).toContain('-1 -- docs/specs');
    expect(conventional.check).toEqual({ kind: 'conventionalRatio', min: 1, last: 1 });
  });

  it('asks for the test first, so the spec’s check fails before the agent builds', () => {
    const steps = field?.checklist.map((item) => item.id) ?? [];
    expect(steps.indexOf('test-first')).toBeLessThan(steps.indexOf('brief'));
    const text = field?.checklist.find((item) => item.id === 'test-first')?.text ?? '';
    expect(text).toContain('failing');
  });

  it('says what “its checks pass” means for a repo with no CI', () => {
    const pr = field?.checklist.find((item) => item.id === 'pr')?.text ?? '';
    expect(pr).toContain('if it has none');
  });

  it('says to roll a leaked key before untracking it, since the PR pushed it', () => {
    const verdict = verifyPaste(verificationOf('agent-kept-secrets-out'), '.env\nsrc/app.ts');
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toMatch(/^Still tracked: \.env\. Roll \(revoke and replace\)/);
    expect(verdict.message).toContain('git rm --cached');
  });

  it('fails when the agent left stray files or tracked a .env', () => {
    const stray = [
      'On branch main',
      'Untracked files:',
      '  (use "git add <file>..." to include in what will be committed)',
      '\tscratch.ts',
      '',
      'nothing added to commit but untracked files present (use "git add" to track)',
    ].join('\n');
    expect(verifyPaste(verificationOf('nothing-left-behind'), stray).passed).toBe(false);
    const leaked = ['.env', '.gitignore', 'src/app.ts'].join('\n');
    expect(verifyPaste(verificationOf('agent-kept-secrets-out'), leaked).passed).toBe(false);
  });

  it('is needed to complete the Act: lessons alone are not enough', () => {
    const played = lessons.reduce(
      (save, lesson) => completeLesson(save, act, lesson, 100, NOW),
      createDefaultSave(NOW),
    );
    expect(played.acts['7']?.completedAt).toBeNull();
    const ids = field?.verifications.map((check) => check.id) ?? [];
    const finished = recordFieldMission(played, act, ids, NOW);
    expect(finished.acts['7']?.completedAt).toBe(NOW.toISOString());
  });
});

describe('Act 7 on its island', () => {
  it('acts out most cards on the workshop, naming only beats it knows', () => {
    const known = beatsForAct(7);
    const cards = lessons.flatMap((lesson) => lesson.cards);
    for (const lesson of lessons) {
      if (lesson.briefingBeat !== undefined)
        expect(known, lesson.id).toContain(lesson.briefingBeat);
    }
    for (const card of cards) {
      if (card.beat !== undefined) expect(known, card.id).toContain(card.beat);
    }
    const withBeat = cards.filter((card) => card.beat !== undefined).length;
    expect(withBeat / cards.length).toBeGreaterThanOrEqual(0.8);
    // The final is acted out too: its cards are the Act's ideas under a clock.
    expect(final?.cards.every((card) => card.beat !== undefined)).toBe(true);
    // Every beat the island has is used somewhere, or it's dead weight.
    const used = new Set(cards.map((card) => card.beat));
    for (const beat of known) expect(used).toContain(beat);
  });
});
