import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hud, openTerminal } from '../../game/hud';
import { currentCard } from '../../game/missions/lessonRunner';
import {
  requireFieldMission,
  requireLessonPlacement,
  LESSON_PLACEMENT_SECONDS_PER_CARD,
} from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { setCatalog } from '../../game/play/catalog';
import { verifyPaste } from '../../game/play/fieldCheck';
import { startFieldMission, submitFieldPaste } from '../../game/play/fieldPlay';
import {
  answerLesson,
  checkLessonOrder,
  endLessonBriefing,
  moveLessonStep,
  nextLessonCard,
  startLessonPlacement,
} from '../../game/play/lessonPlay';
import { leavePlay } from '../../game/play/play';
import { play, type LessonActivity } from '../../game/play/playStore';
import { flushProgress, progress, startProgress, type ProgressStorage } from '../../game/progress';
import { createDefaultSave, type SaveData } from '../../game/save/schema';
import { act4 } from '.';

/*
 * Act 4's placement test and Field Mission, checked as content and played the way Kyle
 * would. The pastes below are shaped like real git output on Windows, so a check that
 * passes here passes on his machine.
 */

const NOW = new Date('2026-10-13T12:00:00.000Z');
const T0 = NOW.getTime();
const { act, lessons } = act4;
const placement = requireLessonPlacement(act);
const field = requireFieldMission(act);
const final = lessons.find((lesson) => lesson.id === act.finalLessonId);
const taught = lessons.filter((lesson) => lesson.id !== act.finalLessonId);

function check(id: string) {
  const found = field.verifications.find((verification) => verification.id === id);
  if (found === undefined) throw new Error(`no verification ${id}`);
  return found;
}

function lesson(): LessonActivity {
  const current = play.get().activity;
  if (current?.kind !== 'lesson') throw new Error('no lesson is being played');
  return current;
}

function save(): SaveData {
  const current = progress.get().save;
  if (current === null) throw new Error('no save');
  return current;
}

/** Answers the card on screen correctly, then moves on. */
function answerRight(): void {
  const { lesson: playing, run } = lesson();
  const card = currentCard(run, playing);
  if (card === undefined) throw new Error('no card');
  if (card.kind === 'order') {
    card.steps.forEach((step, target) => {
      while (lesson().run.card.order.indexOf(step.id) > target) moveLessonStep(step.id, -1, T0);
    });
    checkLessonOrder(T0);
  } else {
    answerLesson(card.options.find((option) => option.correct)?.id ?? '', T0);
  }
  nextLessonCard(T0);
}

describe('Act 4 placement test', () => {
  it('validates against the Act’s lessons', () => {
    expect(validateAct(act, [], lessons)).toEqual([]);
  });

  it('borrows two or three cards from every lesson, and none from the final', () => {
    for (const taughtLesson of taught) {
      const ids = new Set(taughtLesson.cards.map((card) => card.id));
      const lent = placement.cardIds.filter((id) => ids.has(id)).length;
      expect(lent).toBeGreaterThanOrEqual(2);
      expect(lent).toBeLessThanOrEqual(3);
    }
    const finalIds = new Set(final?.cards.map((card) => card.id));
    expect(placement.cardIds.filter((id) => finalIds.has(id))).toEqual([]);
  });

  it('asks what to tell Otto, not only what things are called', () => {
    // Directing an agent is the Act's point, so a placement of pure trivia would mislead.
    const cards = taught.flatMap((entry) => entry.cards);
    const asked = cards.filter((card) => placement.cardIds.includes(card.id));
    expect(asked.filter((card) => card.kind === 'prompt').length).toBeGreaterThanOrEqual(3);
  });

  it('gives each card at least the placement minimum, and less than the final does', () => {
    const perCard = placement.timeLimitSeconds / placement.cardIds.length;
    expect(perCard).toBeGreaterThanOrEqual(LESSON_PLACEMENT_SECONDS_PER_CARD);
    const finalPerCard = (final?.timeLimitSeconds ?? 0) / (final?.cards.length ?? 1);
    expect(perCard).toBeLessThan(finalPerCard);
    expect(placement.passPercent).toBe(85);
  });
});

describe('Act 4 Field Mission', () => {
  it('happens on SandCastles, and never asks for a token', () => {
    expect(field.repoName).toBe('SandCastles');
    const texts = [
      ...field.briefing,
      ...field.checklist.map((item) => item.text),
      ...field.verifications.map((verification) => verification.instruction),
    ].join('\n');
    // It is verified by pasted output alone, so nothing should send Kyle looking for one.
    expect(texts).not.toMatch(/token|api key|ghp_/i);
    expect(texts).toContain('Closes #12');
    for (const section of ['What changed', 'Why', 'How to test']) expect(texts).toContain(section);
  });

  it('expects Kyle to direct his own agent, as the lessons taught', () => {
    const asks = field.checklist.filter((item) => /^Ask (?:your agent|it) /.test(item.text));
    expect(asks.length).toBeGreaterThanOrEqual(3);
  });

  it('passes a clean, up-to-date main and fails a branch with work left', () => {
    const pulled = [
      'On branch main',
      "Your branch is up to date with 'origin/main'.",
      '',
      'nothing to commit, working tree clean',
      '',
    ].join('\r\n');
    expect(verifyPaste(check('pr-main-in-sync'), pulled).passed).toBe(true);
    const unfinished = [
      'On branch fix/tide-heights',
      'Changes not staged for commit:',
      '  (use "git add <file>..." to update what will be committed)',
      '\tmodified:   src/tides.ts',
      '',
      'no changes added to commit (use "git add" and/or "git commit -a")',
    ].join('\n');
    expect(verifyPaste(check('pr-main-in-sync'), unfinished).passed).toBe(false);
  });

  it('passes a squash-merged PR title, and fails a merge commit or a vague title', () => {
    const squashed =
      'a1b2c3d (HEAD -> main, origin/main, origin/HEAD) fix: round tide heights (#12)';
    expect(verifyPaste(check('pr-squashed-onto-main'), squashed).passed).toBe(true);
    const merged = 'b2c3d4e (HEAD -> main, origin/main) Merge pull request #12 from kyle/fix/tide';
    expect(verifyPaste(check('pr-squashed-onto-main'), merged).passed).toBe(false);
    const vague = 'c3d4e5f (HEAD -> main, origin/main) Update tides.ts (#12)';
    expect(verifyPaste(check('pr-squashed-onto-main'), vague).passed).toBe(false);
  });

  it('fails a tracked .env, and allows .env.example', () => {
    const files = ['.env.example', '.gitignore', 'README.md', 'src/tides.ts'];
    expect(verifyPaste(check('pr-shared-no-secrets'), files.join('\n')).passed).toBe(true);
    const leaked = [...files, '.env'].join('\n');
    expect(verifyPaste(check('pr-shared-no-secrets'), leaked).passed).toBe(false);
  });
});

describe('playing Act 4’s new parts', () => {
  beforeEach(async () => {
    setCatalog({ acts: [act4] });
    const storage: ProgressStorage = {
      load: () => Promise.resolve(createDefaultSave(NOW)),
      write: () => Promise.resolve(),
    };
    await startProgress(storage, NOW);
  });

  afterEach(async () => {
    leavePlay();
    await flushProgress();
  });

  it('tests out by clicking, with the terminal closed, and leaves the final to play', () => {
    openTerminal();
    startLessonPlacement(act.act);
    expect(hud.get().terminalOpen).toBe(false);
    endLessonBriefing(T0);
    // The run shuffles each card's options, so answer whatever is on screen, card by card.
    placement.cardIds.forEach(() => {
      answerRight();
    });
    expect(lesson().placement?.result).toEqual({ percent: 100, testedOut: true });
    const after = save();
    for (const taughtLesson of taught) {
      expect(after.missions[taughtLesson.id]?.status).toBe('tested-out');
    }
    expect(after.missions[act.finalLessonId ?? '']).toBeUndefined();
    expect(after.acts['4']?.completedAt).toBe(NOW.toISOString());
  });

  it('opens the Field Mission with the terminal closed, and completes it from pastes', () => {
    openTerminal();
    startFieldMission(act.act);
    expect(hud.get().terminalOpen).toBe(false);
    const clean =
      "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean\n";
    expect(submitFieldPaste('pr-main-in-sync', clean, NOW).passed).toBe(true);
    expect(
      submitFieldPaste('pr-squashed-onto-main', 'a1b2c3d docs: add setup steps (#7)', NOW).passed,
    ).toBe(true);
    expect(submitFieldPaste('pr-shared-no-secrets', 'README.md\nsrc/tides.ts', NOW).passed).toBe(
      true,
    );
    expect(save().acts['4']?.fieldMissionCompletedAt).toBe(NOW.toISOString());
  });
});
