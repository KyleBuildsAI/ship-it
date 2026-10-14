import { describe, expect, it } from 'vitest';
import {
  answerCheck,
  beginAgentStep,
  openFixRound,
  stepPasses,
} from '../../game/missions/agentRunner';
import { evaluate, type Predicate } from '../../game/missions/predicates';
import { describeDirectedMission, describeJudgmentDrills } from './directed.test-helpers';
import {
  beginStep,
  canonicalStart,
  missionById,
  playCard,
  queriesOf,
  trueChecks,
} from './play.test-helpers';

/*
 * Mission 1.2, Deletes Are Forever, played card by card and drill by drill
 * (directed.test-helpers.ts). The tables are what the spec says each card and drill does.
 *
 * Unlike 1.1, some lines here are harmful: a dry run breaks a guard. Allowing one wrecks
 * the step, often for good (`rewindOnly`), and denying one ends differently, so those cards
 * list one ending per gate policy. 'direct' means Otto stopped for new directions: after a
 * deny with no plan B, or a line that failed when the content didn't plan it.
 */

const API = 'C:\\Users\\kyle\\quillwork\\api';
const WRITE = 'write Users/kyle/quillwork/api/config.json';
const EDIT = 'edit Users/kyle/quillwork/api/config.json';
const TMP = 'Users/kyle/quillwork/api/tmp';
const CONFIG_FILE = 'Users/kyle/quillwork/api/config.json';
const COPY_OVER_BACKUP = `Copy-Item ${API}\\config.json ${API}\\config.backup.json`;

describeDirectedMission(missionById('deletes-are-forever'), {
  start: {
    'clear-tmp': {
      'clean-up': { 'allow-all': { passed: false, check: 'wiped' }, 'deny-harmful': 'direct' },
      'inside-tmp': {
        'allow-all': { passed: false, check: 'wiped' },
        // Denied, Otto runs the line he meant: .\tmp\*.
        'deny-harmful': { passed: true, check: 'just-tmp' },
      },
      'whole-tmp': { passed: true, check: 'just-tmp' },
    },
    'the-confirm-question': {
      'no-questions': {
        'allow-all': { passed: false, check: 'nothing' },
        'deny-harmful': 'direct',
      },
      'logs-folder': {
        'allow-all': { passed: false, check: 'nothing' },
        // Otto's A is denied: he answers L instead, then deletes only logs\*.log.
        'deny-harmful': { passed: true, check: 'report-only' },
      },
      'only-logs': { passed: true, check: 'report-only' },
    },
    'backup-first': {
      'just-edit': {
        'allow-all': { passed: false, check: 'no-backup' },
        'deny-harmful': 'direct',
      },
      'backup-then-edit': {
        'allow-all': { passed: false, check: 'backed-up' },
        // Denied, Otto makes the small edit instead, beside the backup he already made.
        'deny-harmful': { passed: true, check: 'kept' },
      },
      'backup-keep-rest': { passed: true, check: 'kept' },
    },
  },
  fixes: {
    'backup-first': {
      'backup-then-edit > restore-and-edit': { passed: true, check: 'kept' },
      'backup-then-edit > restore-only': { passed: false, check: 'unchanged' },
      // The strong card's copy would overwrite the only good backup with the lossy file:
      // denied, Otto stops; allowed, the port is already 3000, so his edit fails and he stops.
      'backup-then-edit > backup-keep-rest': 'direct',
      // With no backup, the restore fails and Otto stops: he never claims the settings are back.
      'just-edit > restore-and-edit': 'direct',
      'just-edit > restore-only': 'direct',
      // Allowed, its edit finds no port 8080 in the lossy file, so Otto stops there too.
      // Denied, the file was never damaged, so the strong card works as it does at the start.
      'just-edit > backup-keep-rest': {
        'allow-all': 'direct',
        'deny-harmful': { passed: true, check: 'kept' },
      },
      // Allowed, a backup made after the damage holds the damaged file.
      'just-edit > backup-then-edit': {
        'allow-all': { passed: false, check: 'no-backup' },
        'deny-harmful': { passed: true, check: 'kept' },
      },
    },
  },
  // Allowed, these lose files no card can bring back: only Rewind can help.
  rewindOnly: [
    'clear-tmp > clean-up',
    'clear-tmp > inside-tmp',
    'the-confirm-question > no-questions',
    'the-confirm-question > logs-folder',
    'backup-first > just-edit',
  ],
  gates: {
    'clear-tmp > clean-up > Remove-Item * -Recurse -Force': true,
    'clear-tmp > inside-tmp > Remove-Item .\\* -Recurse': true,
    'clear-tmp > inside-tmp > Remove-Item .\\tmp\\* -Recurse': false,
    [`clear-tmp > whole-tmp > Remove-Item ${API}\\tmp -Recurse`]: false,
    'the-confirm-question > no-questions > Remove-Item logs -Recurse -Force': true,
    'the-confirm-question > logs-folder > Remove-Item logs': true,
    'the-confirm-question > logs-folder > Remove-Item logs\\*.log': false,
    [`the-confirm-question > only-logs > Remove-Item ${API}\\logs\\*.log`]: false,
    [`backup-first > just-edit > ${WRITE}`]: true,
    // A write that drops settings is harmful even beside a backup: deny it, and Otto edits.
    [`backup-first > backup-then-edit > ${WRITE}`]: true,
    [`backup-first > backup-then-edit > ${EDIT}`]: false,
    [`backup-first > backup-keep-rest > ${EDIT}`]: false,
    [`backup-first > backup-then-edit > backup-keep-rest > ${COPY_OVER_BACKUP}`]: true,
    'backup-first > backup-then-edit > restore-and-edit > Copy-Item config.backup.json config.json': false,
    [`backup-first > backup-then-edit > restore-and-edit > ${EDIT}`]: false,
    'backup-first > backup-then-edit > restore-only > Copy-Item config.backup.json config.json': false,
    // The cards Kyle meets after denying a harmful line: Otto waits, nothing was lost.
    'clear-tmp > clean-up > inside-tmp > Remove-Item .\\* -Recurse': true,
    'clear-tmp > clean-up > inside-tmp > Remove-Item .\\tmp\\* -Recurse': false,
    'clear-tmp > clean-up > just-tmp > Remove-Item .\\tmp\\* -Recurse': false,
    [`clear-tmp > clean-up > whole-tmp > Remove-Item ${API}\\tmp -Recurse`]: false,
    'the-confirm-question > no-questions > just-log-files > Remove-Item logs\\*.log': false,
    'the-confirm-question > no-questions > logs-folder > Remove-Item logs': true,
    'the-confirm-question > no-questions > logs-folder > Remove-Item logs\\*.log': false,
    [`the-confirm-question > no-questions > only-logs > Remove-Item ${API}\\logs\\*.log`]: false,
    [`backup-first > just-edit > backup-keep-rest > ${EDIT}`]: false,
    [`backup-first > just-edit > backup-then-edit > ${WRITE}`]: true,
    [`backup-first > just-edit > backup-then-edit > ${EDIT}`]: false,
  },
});

describeJudgmentDrills(missionById('deletes-are-forever'), {
  'daf-approve-wildcard': { key: ['deny'], wrong: 'allow' },
  'daf-approve-dist': { key: ['allow'], wrong: 'deny' },
  'daf-predict-confirm': { key: ['asks'], wrong: 'deletes' },
  'daf-predict-wildcard': { key: ['nothing'], wrong: 'logs' },
  'daf-diagnose-moved': { key: ['moved'], wrong: 'copied' },
  'daf-fix-restore': { key: ['copy-back'], wrong: 'move-back' },
  'daf-approve-diff': { key: ['deny'], wrong: 'allow' },
  'daf-approve-port-edit': { key: ['allow'], wrong: 'deny' },
});

/*
 * Paths the review played by hand, pinned so they stay honest.
 */
describe('deletes-are-forever, paths a review played', () => {
  const mission = missionById('deletes-are-forever');
  const stepAt = (index: number) => {
    const step = mission.steps[index];
    if (step === undefined) throw new Error(`No step ${String(index)}`);
    return { step, log: beginStep(canonicalStart(mission, index), step) };
  };
  const has = (path: string, text: string): Predicate => ({
    kind: 'driveFile',
    path,
    contains: text,
  });

  it('lets a fix make tmp again after a Stop that left it deleted', () => {
    const { step, log } = stepAt(0);
    const start = { log, state: beginAgentStep(step) };
    // Stop once the full-path delete has run, before mkdir makes tmp again.
    const stopped = playCard(mission, step, start, 'whole-tmp', 'allow-all', 1);
    expect(stopped.state.stage).toEqual({ at: 'direct', round: 'fix' });
    expect(evaluate({ kind: 'driveFolder', path: TMP }, queriesOf(stopped.log))).toBe(false);
    const fixed = playCard(mission, step, stopped, 'just-tmp', 'allow-all');
    expect(fixed.lines.map((ran) => ran.exitCode)).toEqual([0, 0]);
    expect(stepPasses(step, queriesOf(fixed.log))).toBe(true);
  });

  it('stops a restore with no backup, and leaves the lost settings lost', () => {
    const { step, log } = stepAt(2);
    const edited = playCard(
      mission,
      step,
      { log, state: beginAgentStep(step) },
      'just-edit',
      'allow-all',
    );
    const queries = queriesOf(edited.log);
    const truth = trueChecks(step, edited.log)[0] ?? '';
    const fixRound = openFixRound(answerCheck(edited.state, step, truth, queries));
    const restored = playCard(
      mission,
      step,
      { log: edited.log, state: fixRound },
      'restore-and-edit',
      'allow-all',
    );
    // The Copy-Item fails, so Otto never reaches his edit or his "every setting is back".
    expect(restored.lines.map((ran) => ran.exitCode)).toEqual([1]);
    expect(restored.state.stage).toEqual({ at: 'direct', round: 'fix' });
    const after = queriesOf(restored.log);
    expect(evaluate(has(CONFIG_FILE, '"port": 3000'), after)).toBe(true);
    expect(evaluate(has(CONFIG_FILE, '"timeout"'), after)).toBe(false);
  });
});
