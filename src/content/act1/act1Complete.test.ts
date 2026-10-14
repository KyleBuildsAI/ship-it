import { describe, expect, it } from 'vitest';
import { placementLesson } from '../../game/missions/lessonPlacement';
import {
  LESSON_PLACEMENT_SECONDS_PER_CARD,
  requireFieldMission,
  requireLessonPlacement,
} from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { verifyPaste } from '../../game/play/fieldCheck';
import {
  completeLesson,
  completeMission,
  recordFieldMission,
  recordPlacement,
} from '../../game/play/saveRules';
import { createDefaultSave, type SaveData } from '../../game/save/schema';
import { act1, act1Lessons, act1Missions } from './index';
import { act1PlacementCardIds } from './placement';

/*
 * Act 1 as a finished Act: its placement test, its Field Mission, and what completes it.
 * The save rules are the ones play uses, so these prove the real flow, not a copy of it.
 */

const NOW = new Date('2026-10-13T12:00:00.000Z');
const field = requireFieldMission(act1);
const [lesson15, lesson16, final] = act1Lessons;
if (lesson15 === undefined || lesson16 === undefined || final === undefined) {
  throw new Error('Act 1 has lessons 1.5, 1.6 and a final');
}

/** The verification with this id, so each test reads like the checklist. */
function check(id: string) {
  const found = field.verifications.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No verification "${id}"`);
  return found;
}

function finishMissions(save: SaveData): SaveData {
  return act1Missions.reduce(
    (next, mission) =>
      completeMission(
        next,
        act1,
        mission,
        { drillPercent: 100, questionXp: 0, directingXp: 0 },
        NOW,
      ),
    save,
  );
}

function finishLessons(save: SaveData): SaveData {
  return act1Lessons.reduce((next, lesson) => completeLesson(next, act1, lesson, 100, NOW), save);
}

function verifyField(save: SaveData): SaveData {
  const ids = field.verifications.map((entry) => entry.id);
  return recordFieldMission(save, act1, ids, NOW);
}

describe('Act 1, finished', () => {
  it('is out of early access with every part, and passes validateAct', () => {
    expect(act1.earlyAccess).toBe(false);
    expect(act1.placementTest).toBeDefined();
    expect(act1.fieldMission?.title).toBe('Brief Your Real Agent');
    expect(act1.finalLessonId).toBe('works-on-my-machine');
    expect(validateAct(act1, act1Missions, act1Lessons)).toEqual([]);
  });

  it('completes once every mission, lesson and the final are done and the brief is verified', () => {
    const played = finishLessons(finishMissions(createDefaultSave(NOW)));
    // The final stands in for the boss, but the Field Mission is still to do.
    expect(played.acts['1']).toMatchObject({
      bossCompletedAt: NOW.toISOString(),
      completedAt: null,
    });
    expect(verifyField(played).acts['1']?.completedAt).toBe(NOW.toISOString());
  });

  it('stays open with the Field Mission verified but a mission unplayed', () => {
    const [, ...rest] = act1Missions;
    const partly = rest.reduce(
      (next, mission) =>
        completeMission(
          next,
          act1,
          mission,
          { drillPercent: 100, questionXp: 0, directingXp: 0 },
          NOW,
        ),
      createDefaultSave(NOW),
    );
    expect(verifyField(finishLessons(partly)).acts['1']?.completedAt).toBeNull();
  });
});

describe("Act 1's placement test", () => {
  const test = requireLessonPlacement(act1);
  const played = placementLesson(act1, act1Lessons);

  it('plays ten cards, five from each of 1.5 and 1.6, none from the final', () => {
    const owner = (id: string) =>
      act1Lessons.find((lesson) => lesson.cards.some((card) => card.id === id))?.id;
    const owners = act1PlacementCardIds.map(owner);
    expect(owners.filter((id) => id === lesson15.id)).toHaveLength(5);
    expect(owners.filter((id) => id === lesson16.id)).toHaveLength(5);
    expect(owners).not.toContain(final.id);
    expect(played.cards.map((card) => card.id)).toEqual([...act1PlacementCardIds]);
  });

  it('asks both kinds of question: picking and putting steps in order', () => {
    const kinds = new Set(played.cards.map((card) => card.kind));
    expect(kinds).toContain('order');
    expect(kinds).toContain('prompt');
    expect(kinds).toContain('choose');
  });

  it('runs on one clock with at least the placement minimum a card, and no XP of its own', () => {
    expect(played.timeLimitSeconds).toBe(360);
    expect(test.timeLimitSeconds / test.cardIds.length).toBeGreaterThanOrEqual(
      LESSON_PLACEMENT_SECONDS_PER_CARD,
    );
    expect(played.xp).toBe(0);
    expect(test.passPercent).toBe(85);
  });

  it('tests out of 1.5 and 1.6 at half XP and completes the Act, leaving the final to play', () => {
    // lessonPlay saves a placement with the Act's lessons, exactly like this.
    const save = recordPlacement(
      createDefaultSave(NOW),
      act1,
      act1Lessons,
      { percent: 90, testedOut: true },
      NOW,
    );
    expect(save.missions[lesson15.id]?.status).toBe('tested-out');
    expect(save.missions[lesson16.id]?.status).toBe('tested-out');
    expect(save.missions[final.id]).toBeUndefined();
    expect(save.profile.xp).toBe(lesson15.xp / 2 + lesson16.xp / 2);
    expect(save.acts['1']?.completedAt).toBe(NOW.toISOString());
  });

  it('records a miss as an attempt without testing out', () => {
    const save = recordPlacement(
      createDefaultSave(NOW),
      act1,
      act1Lessons,
      { percent: 70, testedOut: false },
      NOW,
    );
    expect(save.acts['1']?.placement).toMatchObject({ bestPercent: 70, testedOut: false });
    expect(save.acts['1']?.completedAt).toBeNull();
    expect(save.profile.xp).toBe(0);
  });
});

describe('Brief Your Real Agent', () => {
  it('happens on SandCastles, with the agent doing the work and Kyle checking it', () => {
    expect(field.id).toBe('brief-your-real-agent');
    expect(field.repoName).toBe('SandCastles');
    expect(field.checklist.map((item) => item.id)).toEqual([
      'runtimes',
      'env-names',
      'ports',
      'doc',
      'handoff',
      'commit',
    ]);
    const steps = field.checklist.map((item) => item.text).join(' ');
    expect(steps).toMatch(/Ask (your agent|it)/);
    expect(steps).toContain('## Environment');
    expect(steps).toContain('never print or read .env');
  });

  it('never asks for a token, a key or a value, and never edits a settings file', () => {
    const words = [
      ...field.briefing,
      ...field.checklist.map((item) => item.text),
      ...field.verifications.map((entry) => entry.instruction),
    ].join(' ');
    expect(words).not.toMatch(/token|api key|ghp_|settings\.json|permission/i);
    expect(words).toContain('Names only; values never leave .env.');
  });

  it('passes a tracked file list with the brief and no .env, and fails one with .env', () => {
    const tracked = ['.env.example', '.gitignore', 'CLAUDE.md', 'package.json', 'src/index.ts'];
    expect(verifyPaste(check('no-secrets-tracked'), tracked.join('\n')).passed).toBe(true);
    const leaked = verifyPaste(check('no-secrets-tracked'), [...tracked, '.env'].join('\n'));
    expect(leaked.passed).toBe(false);
    expect(leaked.message).toContain('.env');
  });

  it('passes a clean, pushed status, and fails one with the brief still uncommitted', () => {
    const clean = [
      'On branch main',
      "Your branch is up to date with 'origin/main'.",
      '',
      'nothing to commit, working tree clean',
    ].join('\n');
    expect(verifyPaste(check('clean-tree'), clean).passed).toBe(true);
    const dirty = [
      'On branch main',
      "Your branch is up to date with 'origin/main'.",
      '',
      'Untracked files:',
      '  (use "git add <file>..." to include in what will be committed)',
      '\tCLAUDE.md',
      '',
      'nothing added to commit but untracked files present (use "git add" to track)',
    ].join('\n');
    expect(verifyPaste(check('clean-tree'), dirty).passed).toBe(false);
  });

  it('judges only the newest commit: docs: passes, a vague message fails', () => {
    const older = ['b2c3d4e feat: add castle builder', 'c3d4e5f update stuff'];
    const docs = ['a1b2c3d (HEAD -> main, origin/main) docs: add environment setup for agents'];
    expect(verifyPaste(check('docs-commit'), [...docs, ...older].join('\n')).passed).toBe(true);
    const vague = ['a1b2c3d (HEAD -> main) added claude file', ...older];
    expect(verifyPaste(check('docs-commit'), vague.join('\n')).passed).toBe(false);
  });

  it('completes the Field Mission only when all three checks have passed', () => {
    const [first, ...rest] = field.verifications.map((entry) => entry.id);
    const one = recordFieldMission(createDefaultSave(NOW), act1, [first ?? ''], NOW);
    expect(one.acts['1']?.fieldMissionCompletedAt ?? null).toBeNull();
    const all = recordFieldMission(one, act1, rest, NOW);
    expect(all.acts['1']?.fieldMissionCompletedAt).toBe(NOW.toISOString());
  });
});
