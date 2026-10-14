import { describeDirectedMission, describeJudgmentDrills } from './directed.test-helpers';
import { missionById } from './play.test-helpers';

/*
 * Mission 1.2, Deletes Are Forever, played card by card and drill by drill
 * (directed.test-helpers.ts). The tables are what the spec says each card and drill does.
 *
 * Unlike 1.1, some lines here are harmful: a dry run breaks a guard. Allowing one wrecks
 * the step for good, and denying one ends differently, so those cards list one ending per
 * gate policy. 'direct' means Otto stopped for new directions after a deny with no plan B.
 */

const API = 'C:\\Users\\kyle\\quillwork\\api';
const CONFIG = 'write Users/kyle/quillwork/api/config.json';
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
      'backup-then-edit': { passed: false, check: 'backed-up' },
      'backup-keep-rest': { passed: true, check: 'kept' },
    },
  },
  fixes: {
    'backup-first': {
      'backup-then-edit > restore-and-edit': { passed: true, check: 'kept' },
      'backup-then-edit > restore-only': { passed: false, check: 'unchanged' },
      // Allowed, the strong card's copy overwrites the only good backup with the lossy file.
      'backup-then-edit > backup-keep-rest': { passed: false, check: 'no-backup' },
      // Otto's write puts every setting back, but nothing can bring back a backup never made.
      'just-edit > restore-and-edit': { passed: false, check: 'no-backup' },
    },
  },
  gates: {
    'clear-tmp > clean-up > Remove-Item * -Recurse -Force': true,
    'clear-tmp > inside-tmp > Remove-Item .\\* -Recurse': true,
    'clear-tmp > inside-tmp > Remove-Item .\\tmp\\* -Recurse': false,
    [`clear-tmp > whole-tmp > Remove-Item ${API}\\tmp -Recurse`]: false,
    'the-confirm-question > no-questions > Remove-Item logs -Recurse -Force': true,
    'the-confirm-question > logs-folder > Remove-Item logs': true,
    'the-confirm-question > logs-folder > Remove-Item logs\\*.log': false,
    [`the-confirm-question > only-logs > Remove-Item ${API}\\logs\\*.log`]: false,
    [`backup-first > just-edit > ${CONFIG}`]: true,
    [`backup-first > backup-then-edit > ${CONFIG}`]: false,
    [`backup-first > backup-keep-rest > ${CONFIG}`]: false,
    [`backup-first > backup-then-edit > backup-keep-rest > ${COPY_OVER_BACKUP}`]: true,
    [`backup-first > backup-then-edit > backup-keep-rest > ${CONFIG}`]: false,
    'backup-first > backup-then-edit > restore-and-edit > Copy-Item config.backup.json config.json': false,
    [`backup-first > backup-then-edit > restore-and-edit > ${CONFIG}`]: false,
    'backup-first > backup-then-edit > restore-only > Copy-Item config.backup.json config.json': false,
    [`backup-first > just-edit > backup-keep-rest > ${CONFIG}`]: false,
    [`backup-first > just-edit > restore-and-edit > ${CONFIG}`]: false,
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
  'daf-approve-backed-up': { key: ['allow'], wrong: 'deny' },
});
