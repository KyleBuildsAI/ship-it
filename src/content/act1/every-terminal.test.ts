import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { beginAgentStep } from '../../game/missions/agentRunner';
import { answerKey } from '../../game/missions/judgment';
import { evaluate } from '../../game/missions/predicates';
import { isJudgmentDrill } from '../../game/missions/schema';
import { describeDirectedMission, describeJudgmentDrills } from './directed.test-helpers';
import { beginStep, canonicalStart, missionById, playCard, queriesOf } from './play.test-helpers';

/*
 * Mission 1.4, Every Terminal Is Its Own World, played card by card and drill by drill
 * (directed.test-helpers.ts). The tables are what the spec says each card and drill does.
 *
 * The mission pauses only on deletes and replaced files (`destructive`), and no card
 * makes either: Windows refuses Otto's delete in Program Files, since his terminal isn't
 * elevated, and every .env change is an append. So nothing pauses.
 * 'direct' means Otto stopped for new directions after a deny with no plan B.
 */

const mission = missionById('every-terminal');

describeDirectedMission(mission, {
  start: {
    'npm-not-recognized': {
      // Windows refuses the delete, so Node stays and PS 1's PATH is still the old copy.
      reinstall: { passed: false, check: 'stale' },
      'look-here': { passed: false, check: 'stale' },
      'new-terminal': { passed: true, check: 'fresh' },
    },
    'saved-for-new-terminals': {
      'trust-the-save': { passed: false, check: 'missing' },
      'print-here': { passed: false, check: 'missing' },
      'fresh-in-api': { passed: true, check: 'ready' },
    },
    'make-it-last': {
      'prove-it': { passed: false, check: 'nowhere' },
      'check-here': { passed: false, check: 'nowhere' },
      'append-env': { passed: true, check: 'dotenv' },
    },
  },
  fixes: {
    'npm-not-recognized': {
      'look-here > fresh-tab': { passed: true, check: 'fresh' },
      'look-here > new-terminal': { passed: true, check: 'fresh' },
      'reinstall > fresh-tab': { passed: true, check: 'fresh' },
    },
    'saved-for-new-terminals': {
      'trust-the-save > fresh-in-api': { passed: true, check: 'ready' },
      'print-here > fresh-in-api': { passed: true, check: 'ready' },
      // A new terminal sees QUILL_ENV, but it opens at home.
      'print-here > open-one': { passed: false, check: 'home' },
    },
    'make-it-last': {
      'prove-it > save-it': { passed: true, check: 'dotenv' },
      'check-here > save-it': { passed: true, check: 'dotenv' },
      'prove-it > append-env': { passed: true, check: 'dotenv' },
    },
  },
  gates: {},
});

describeJudgmentDrills(mission, {
  'etw-predict-new-tab': { key: ['dev'], wrong: 'empty' },
  'etw-predict-old-tab': { key: ['empty'], wrong: 'dev' },
  'etw-diagnose-stale-tab': { key: ['stale'], wrong: 'missing' },
  'etw-diagnose-claim-tab': { key: ['only-ps1'], wrong: 'right' },
  'etw-diagnose-export': { key: ['bash'], wrong: 'new-only' },
  'etw-approve-clear-path': { key: ['deny'], wrong: 'allow' },
  'etw-approve-append-env': { key: ['allow'], wrong: 'deny' },
  'etw-fix-stale-path': { key: ['new-tab'], wrong: 'reinstall' },
});

describe('every-terminal, against the review', () => {
  it('leaves Node installed when Otto tries to delete it: Program Files needs an admin', () => {
    const step = mission.steps[0];
    if (step === undefined) throw new Error('No step 1');
    const log = beginStep(canonicalStart(mission, 0), step);
    const played = playCard(
      mission,
      step,
      { log, state: beginAgentStep(step) },
      'reinstall',
      'allow-all',
    );
    const removal = played.lines.find((run) => run.line.startsWith('Remove-Item'));
    expect(removal?.exitCode).not.toBe(0);
    expect(removal?.output).toContain(
      "Access to the path 'C:\\Program Files\\nodejs\\node.exe' is denied.",
    );
    // Nothing changed, so nothing paused, whatever the gate policy.
    expect(played.gates).toEqual([]);
    const node = { kind: 'driveFile', path: 'Program Files/nodejs/node.exe' } as const;
    expect(evaluate(node, queriesOf(played.log))).toBe(true);
  });

  it('keeps the API key in .env, as Mission 1.3 left it', () => {
    const setup = JSON.stringify(mission.initialRepoState);
    expect(setup).toContain('QUILL_API_KEY=dev-key-for-the-game-1234');
    expect(setup).toContain('DATABASE_URL=');
  });

  it('shows the stale-tab evidence in the drills instead of stating the cause', () => {
    for (const id of ['etw-diagnose-stale-tab', 'etw-fix-stale-path']) {
      const drill = mission.drills.find((candidate) => candidate.id === id);
      if (drill === undefined || !isJudgmentDrill(drill)) throw new Error(`No drill ${id}`);
      expect(drill.prompt).not.toMatch(/install/i);
      expect(drill.history.map((action) => ('line' in action ? action.line : ''))).toEqual([
        'Write-Output $env:Path',
        "Get-ChildItem 'C:\\Program Files\\nodejs'",
        'npm --version',
      ]);
      expect(answerKey(drill, testDeps()).length).toBe(1);
    }
  });
});
