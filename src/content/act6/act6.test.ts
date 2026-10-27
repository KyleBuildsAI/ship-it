import { describe, expect, it } from 'vitest';
import { LessonSchema, isPickCard } from '../../game/missions/lessonSchema';
import { requireFieldMission, requireLessonPlacement } from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { verifyPaste } from '../../game/play/fieldCheck';
import { beatsForAct } from '../../game/world/beats';
import { act6, act6Lessons, act6Placement, documentOneRequest } from './index';

/*
 * Act 6's own content checks, on top of the shared ones every lesson Act gets in
 * lessonActs.test.ts: the shape this Act promises (four lessons and a timed final), and
 * the habits that keep it about directing Otto and judging systems rather than syntax.
 */

const { act, lessons } = act6;
const regular = lessons.filter((lesson) => lesson.kind === 'lesson');
const final = lessons.at(-1);

describe('Act 6: How Systems Work', () => {
  it('parses every lesson input with the lesson schema', () => {
    for (const input of act6Lessons) {
      const result = LessonSchema.safeParse(input);
      // On failure, the issues name the card and field that broke a budget.
      expect(result.success ? [] : result.error.issues).toEqual([]);
    }
  });

  it('passes validateAct, placement and Field Mission included, lessons in play order', () => {
    expect(validateAct(act, [], lessons)).toEqual([]);
    expect(act.missionIds).toEqual(lessons.map((lesson) => lesson.id));
    expect(act.missionIds).toEqual([
      'requests-and-responses',
      'apis-and-auth',
      'data-speed-and-scale',
      'logs-and-stack-traces',
      'the-3am-page',
    ]);
  });

  it('has four lessons of 7 to 10 cards, then the final', () => {
    expect(lessons.map((lesson) => lesson.kind)).toEqual([
      'lesson',
      'lesson',
      'lesson',
      'lesson',
      'final',
    ]);
    for (const lesson of regular) {
      expect(lesson.cards.length, lesson.id).toBeGreaterThanOrEqual(7);
      expect(lesson.cards.length, lesson.id).toBeLessThanOrEqual(10);
    }
  });

  it('ends on The 3am Page: 8 to 10 cards on one 4 to 6 minute clock', () => {
    expect(final?.title).toBe('The 3am Page');
    expect(act.finalLessonId).toBe(final?.id);
    const cards = final?.cards.length ?? 0;
    expect(cards).toBeGreaterThanOrEqual(8);
    expect(cards).toBeLessThanOrEqual(10);
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds).toBeGreaterThanOrEqual(240);
    expect(seconds).toBeLessThanOrEqual(360);
  });

  it('keeps lesson ids unique, and card, option and step ids unique where they live', () => {
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lesson of lessons) {
      const cardIds = lesson.cards.map((card) => card.id);
      expect(new Set(cardIds).size, lesson.id).toBe(cardIds.length);
      for (const card of lesson.cards) {
        const inner = isPickCard(card)
          ? card.options.map((option) => option.id)
          : card.steps.map((step) => step.id);
        expect(new Set(inner).size, `${lesson.id}/${card.id}`).toBe(inner.length);
      }
    }
  });

  it('gives every pick card a right answer and a wrong one', () => {
    for (const lesson of lessons) {
      for (const card of lesson.cards.filter(isPickCard)) {
        const where = `${lesson.id}/${card.id}`;
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

  it('asks what to tell Otto at least twice, and has an order card, in every lesson', () => {
    // The Act is about briefing and judging an agent, so each lesson practises both.
    for (const lesson of lessons) {
      const kinds = lesson.cards.map((card) => card.kind);
      expect(kinds.filter((kind) => kind === 'prompt').length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(kinds, lesson.id).toContain('order');
    }
  });

  it('is a finished Act, with a placement test and a Field Mission', () => {
    expect(act.earlyAccess).toBe(false);
    expect(act.placementTest).toBeDefined();
    expect(act.fieldMission?.id).toBe('document-one-request');
  });

  it('borrows three placement cards from each lesson, none from the final', () => {
    const test = requireLessonPlacement(act);
    const lenders = test.cardIds.map(
      (id) => lessons.find((lesson) => lesson.cards.some((card) => card.id === id))?.id,
    );
    expect(lenders).not.toContain(final?.id);
    for (const lesson of regular) {
      expect(lenders.filter((id) => id === lesson.id).length, lesson.id).toBe(3);
    }
    // The final's pace, 40 seconds a card, since these cards have code and logs to read.
    expect(test.timeLimitSeconds).toBe(test.cardIds.length * 40);
    expect(test.passPercent).toBe(85);
  });

  it('asks a placement card that briefs Otto from every lesson', () => {
    for (const lesson of regular) {
      const borrowed = lesson.cards.filter((card) => act6Placement.cardIds.includes(card.id));
      expect(
        borrowed.some((card) => card.kind === 'prompt'),
        lesson.id,
      ).toBe(true);
    }
  });
  it('acts out most cards on the island, naming only beats it knows', () => {
    const known = beatsForAct(6);
    const cards = lessons.flatMap((lesson) => lesson.cards);
    for (const lesson of lessons) {
      // Every lesson opens on a scene, so the island is moving before the first card.
      expect(known, lesson.id).toContain(lesson.briefingBeat);
    }
    for (const card of cards) {
      if (card.beat !== undefined) expect(known, card.id).toContain(card.beat);
    }
    const withBeat = cards.filter((card) => card.beat !== undefined).length;
    expect(withBeat / cards.length).toBeGreaterThanOrEqual(0.8);
    // The final is acted out too, not left to a still island.
    expect(final?.cards.some((card) => card.beat !== undefined)).toBe(true);
    // Every beat the island has is used somewhere, or it's dead weight.
    const used = new Set(cards.map((card) => card.beat));
    for (const beat of known) expect(used).toContain(beat);
  });
});

describe('Act 6 Field Mission: Document One Request', () => {
  const field = requireFieldMission(act6.act);
  const verification = (id: string) => {
    const found = field.verifications.find((check) => check.id === id);
    if (found === undefined) throw new Error(`no verification ${id}`);
    return found;
  };
  const synced = [
    'On branch main',
    "Your branch is up to date with 'origin/main'.",
    '',
    'nothing to commit, working tree clean',
    '',
  ].join('\n');

  it('happens on SandCastles, through a docs branch and a pull request', () => {
    expect(field.repoName).toBe('SandCastles');
    const text = field.checklist.map((item) => item.text).join(' ');
    for (const words of ['agent', 'README', 'status code', 'docs/', 'pull request', '/health']) {
      expect(text, words).toContain(words);
    }
  });

  it('lets the agent run every check, as long as Kyle sees the exact output', () => {
    // A vibe coder may never open PowerShell, so no check depends on typing it himself.
    for (const check of field.verifications) {
      expect(check.instruction, check.id).toContain('ask your agent');
      expect(check.instruction, check.id).toContain('exact output');
    }
  });

  it('asks for fake values and a read-through for secrets, since no paste can see them', () => {
    const text = field.checklist.map((item) => item.text).join(' ');
    expect(text).toContain('obvious fakes');
    expect(text).toContain('no keys, tokens, cookies');
    expect(text).not.toContain('not a guess');
  });

  it('passes a documented request, merged as docs:, synced, with no secret file', () => {
    const readme = 'README.md:12:GET /health\nREADME.md:14:Returns 200 and {"status":"ok"}.\n';
    expect(verifyPaste(verification('readme-documents-request'), readme)).toMatchObject({
      passed: true,
    });
    expect(
      verifyPaste(verification('merged-docs-commit'), 'a1b2c3d docs: document GET /health (#7)\n'),
    ).toMatchObject({ passed: true });
    expect(verifyPaste(verification('synced-with-github'), synced)).toMatchObject({
      passed: true,
    });
    expect(
      verifyPaste(verification('no-secret-file'), 'README.md\n.env.example\nsrc/server.ts\n'),
    ).toMatchObject({ passed: true });
  });

  it('fails an untouched repo that only passed Act 2', () => {
    // After Clean the Dirty Tree, the repo is clean and its commits Conventional, so only
    // the README itself and the type of its newest change show this mission was done.
    const noApi = 'README.md:3:Built in 2024 on port 3000.\n';
    expect(verifyPaste(verification('readme-documents-request'), noApi)).toMatchObject({
      passed: false,
    });
    expect(
      verifyPaste(verification('merged-docs-commit'), 'a1b2c3d chore: ignore build output\n'),
    ).toMatchObject({ passed: false });
  });

  it('says to merge and fetch, not to commit, when GitHub’s main has no README change', () => {
    const verdict = verifyPaste(verification('merged-docs-commit'), '');
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('Merge your pull request, run git fetch');
    expect(verdict.message).not.toContain('commit it');
  });

  it('fails an unpushed commit, leftover changes and a committed .env', () => {
    const ahead = synced.replace(
      "Your branch is up to date with 'origin/main'.",
      "Your branch is ahead of 'origin/main' by 1 commit.",
    );
    expect(verifyPaste(verification('synced-with-github'), ahead)).toMatchObject({
      passed: false,
    });
    const dirty = [
      'On branch main',
      "Your branch is up to date with 'origin/main'.",
      '',
      'Changes not staged for commit:',
      '  (use "git add <file>..." to update what will be committed)',
      '\tmodified:   README.md',
      '',
      'no changes added to commit (use "git add" and/or "git commit -a")',
      '',
    ].join('\n');
    expect(verifyPaste(verification('synced-with-github'), dirty)).toMatchObject({
      passed: false,
    });
    expect(verifyPaste(verification('no-secret-file'), 'README.md\n.env\n')).toMatchObject({
      passed: false,
    });
  });

  it('gives its own docs: example when the README’s newest change is another type', () => {
    const verdict = verifyPaste(
      verification('merged-docs-commit'),
      '9f3e2a1 feat: add health endpoint',
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('like "docs: document GET /health"');
    expect(verdict.message).not.toContain('environment setup');
  });

  it('needs the clean, synced status to be main, not the docs branch', () => {
    const onBranch = synced
      .replace('On branch main', 'On branch docs/health')
      .replace("'origin/main'", "'origin/docs/health'");
    const verdict = verifyPaste(verification('synced-with-github'), onBranch);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('git switch main');
  });

  it('says to change the keys first when .env is tracked, since main already matches GitHub', () => {
    const tracked = ['.env', '.gitignore', 'README.md', 'src/server.ts'].join('\n');
    const verdict = verifyPaste(verification('no-secret-file'), tracked);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toMatch(/^Still tracked: \.env\. It’s on GitHub now/);
    expect(verdict.message).toContain('change them all first');
    expect(verdict.message).toContain('through a pull request');
  });

  it('never asks for a GitHub token or a key', () => {
    // It works with no token: every check reads output Kyle pastes from his own terminal.
    const text = JSON.stringify(documentOneRequest).toLowerCase();
    expect(text).not.toContain('token:');
    expect(text).not.toMatch(/ghp_|sk-ant-/);
  });
});

describe('Act 6 topics', () => {
  it('covers the topics DESIGN.md section 11 lists for this Act', () => {
    // A loose check that each topic shows up somewhere a player will read it.
    const text = JSON.stringify(act6Lessons).toLowerCase();
    for (const topic of [
      'status code',
      'json',
      'rest',
      'oauth',
      'api key',
      'session',
      'select',
      'index',
      'cache',
      'queue',
      'container',
      'cloud',
      'log',
      'stack trace',
    ]) {
      expect(text, topic).toContain(topic);
    }
  });
});
