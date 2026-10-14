import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hud, openTerminal } from '../../game/hud';
import { currentCard } from '../../game/missions/lessonRunner';
import {
  requireFieldMission,
  requireLessonPlacement,
  LESSON_PLACEMENT_SECONDS_PER_CARD,
} from '../../game/missions/schema';
import { countWords } from '../../game/missions/schemaParts';
import { validateAct } from '../../game/missions/validateAct';
import { setCatalog } from '../../game/play/catalog';
import { verifyPaste } from '../../game/play/fieldCheck';
import { checkFieldOnGitHub, startFieldMission, submitFieldPaste } from '../../game/play/fieldPlay';
import type { GitHubGet } from '../../game/play/githubCheck';
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

  it('can’t be passed by picking the longest option', () => {
    // Eleven pick cards: if the right answer were usually the longest, that habit alone
    // would score 85%. Four options each, so guessing doesn't get close either.
    const cards = taught
      .flatMap((entry) => entry.cards)
      .filter((card) => placement.cardIds.includes(card.id));
    let rightIsLongest = 0;
    for (const card of cards) {
      if (card.kind === 'order') continue;
      expect(card.options.length, card.id).toBeGreaterThanOrEqual(4);
      const right = countWords(card.options.find((option) => option.correct)?.text ?? '');
      const wrong = card.options.filter((option) => !option.correct);
      const longestWrong = Math.max(...wrong.map((option) => countWords(option.text)));
      if (right > longestWrong) rightIsLongest++;
    }
    expect(rightIsLongest).toBeLessThanOrEqual(2);
  });

  it('tests sequence with an order card, and judgment over definitions', () => {
    const cards = taught
      .flatMap((entry) => entry.cards)
      .filter((card) => placement.cardIds.includes(card.id));
    expect(cards.filter((card) => card.kind === 'order').length).toBeGreaterThanOrEqual(1);
    // These two only test reading an error line or recalling what MAJOR means.
    expect(placement.cardIds).not.toContain('protected-main');
    expect(placement.cardIds).not.toContain('major');
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

  it('starts with the remote, the GitHub CLI and the history check, before any push', () => {
    const ids = field.checklist.map((item) => item.id);
    expect(ids.slice(0, 3)).toEqual(['check-the-remote', 'check-the-cli', 'check-the-history']);
    expect(ids.indexOf('check-the-history')).toBeLessThan(ids.indexOf('branch-and-commit'));
    expect(field.verifications[0]?.id).toBe('pr-history-no-env');
    const cli = field.checklist.find((item) => item.id === 'check-the-cli')?.text ?? '';
    expect(cli).toContain('gh auth login yourself');
  });

  it('tells Kyle to check the squash title GitHub fills in', () => {
    const squash = field.checklist.find((item) => item.id === 'squash-and-pull')?.text ?? '';
    expect(squash).toMatch(/Before confirming, check the commit title/);
  });

  it('passes an empty history search for .env, but only with the command copied', () => {
    const search = check('pr-history-no-env');
    const ran = 'PS C:\\code\\SandCastles> git log --all --oneline -- .env\r\n';
    expect(verifyPaste(search, ran).passed).toBe(true);
    expect(verifyPaste(search, '').passed).toBe(false);
    // Searching only the current branch can miss a commit on another one.
    expect(verifyPaste(search, 'PS> git log --oneline -- .env').passed).toBe(false);
  });

  it('stops the push when .env is anywhere in history, and says what to do', () => {
    const found = [
      'PS> git log --all --oneline -- .env',
      'e4f5a6b chore: stop tracking .env',
      '1a2b3c4 feat: add the tide API client',
    ].join('\n');
    const verdict = verifyPaste(check('pr-history-no-env'), found);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('Don’t push');
    expect(verdict.message).toContain('Change every key');
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

  it('fails a clean tree that is on a feature branch, or behind GitHub', () => {
    const onBranch = [
      'On branch fix/tide-heights',
      "Your branch is up to date with 'origin/fix/tide-heights'.",
      '',
      'nothing to commit, working tree clean',
    ].join('\n');
    const branchVerdict = verifyPaste(check('pr-main-in-sync'), onBranch);
    expect(branchVerdict.passed).toBe(false);
    expect(branchVerdict.message).toContain('git switch main');
    const notPulled = [
      'On branch main',
      "Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded.",
      '  (use "git pull" to update your local branch)',
      '',
      'nothing to commit, working tree clean',
    ].join('\n');
    const behindVerdict = verifyPaste(check('pr-main-in-sync'), notPulled);
    expect(behindVerdict.passed).toBe(false);
    expect(behindVerdict.message).toContain('git pull');
    // No upstream line: nothing shows main matches GitHub.
    const unknown = 'On branch main\nnothing to commit, working tree clean\n';
    expect(verifyPaste(check('pr-main-in-sync'), unknown).passed).toBe(false);
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

  it('fails a Conventional commit with no PR number, like a direct commit to main', () => {
    expect(verifyPaste(check('pr-squashed-onto-main'), 'a1b2c3d fix: x').passed).toBe(false);
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
    // The Field Mission is real work on a real repo, so a card test never skips it.
    expect(after.acts['4']?.completedAt).toBeNull();
  });

  it('opens the Field Mission with the terminal closed, and completes it from pastes', () => {
    openTerminal();
    startFieldMission(act.act);
    expect(hud.get().terminalOpen).toBe(false);
    expect(
      submitFieldPaste('pr-history-no-env', 'PS> git log --all --oneline -- .env', NOW).passed,
    ).toBe(true);
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

  it('asks for owner/repo before calling GitHub, and needs the mission open', async () => {
    const never: GitHubGet = () => Promise.reject(new Error('should not be called'));
    expect((await checkFieldOnGitHub('kyle-c/SandCastles', NOW, never)).message).toBe(
      'No Field Mission is open.',
    );
    startFieldMission(act.act);
    expect((await checkFieldOnGitHub('SandCastles', NOW, never)).message).toContain('owner/repo');
  });

  it('confirms the PR on GitHub when Kyle opts in, asking only api.github.com paths', async () => {
    startFieldMission(act.act);
    const asked: string[] = [];
    const github: GitHubGet = (path) => {
      asked.push(path);
      if (path.includes('/pulls')) {
        const body = '## What changed\nx\n## Why\ny\n## How to test\nz\n\nCloses #12';
        return Promise.resolve({
          status: 200,
          body: [
            {
              number: 13,
              title: 'fix: round tide heights',
              body,
              merged_at: '2026-10-12T09:00:00Z',
              merge_commit_sha: 'abc123',
            },
          ],
        });
      }
      if (path.endsWith('/issues/12'))
        return Promise.resolve({ status: 200, body: { state: 'closed' } });
      return Promise.resolve({ status: 200, body: { sha: 'abc123' } });
    };
    const verdict = await checkFieldOnGitHub('https://github.com/kyle-c/SandCastles', NOW, github);
    expect(verdict.passed).toBe(true);
    expect(asked.every((path) => path.startsWith('/repos/kyle-c/SandCastles/'))).toBe(true);
    const saved = save().fieldMissions[field.id];
    expect(saved?.githubRepo).toBe('kyle-c/SandCastles');
    expect(saved?.githubVerifiedAt).toBe(NOW.toISOString());
    // The opt-in check never finishes the mission by itself: the pastes do.
    expect(save().acts['4']?.fieldMissionCompletedAt ?? null).toBeNull();
  });
});
