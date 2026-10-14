import { describeDirectedMission, describeJudgmentDrills } from './directed.test-helpers';
import { missionById } from './play.test-helpers';

/*
 * Mission 1.4, Every Terminal Is Its Own World, played card by card and drill by drill
 * (directed.test-helpers.ts). The tables are what the spec says each card and drill does.
 *
 * The mission pauses only on deletes and replaced files (`destructive`), so the gates are
 * the big hammers: removing Node, and replacing .env when one line would do.
 * 'direct' means Otto stopped for new directions after a deny with no plan B.
 */

const REMOVE_NODE = "Remove-Item 'C:\\Program Files\\nodejs' -Recurse";
const REPLACE_ENV = "Set-Content C:\\Users\\kyle\\quillwork\\api\\.env 'QUILL_DEBUG=true'";

describeDirectedMission(missionById('every-terminal'), {
  start: {
    'npm-not-recognized': {
      reinstall: { 'allow-all': { passed: false, check: 'gone' }, 'deny-harmful': 'direct' },
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
      'replace-env': {
        'allow-all': { passed: false, check: 'port-lost' },
        // Denied, Otto appends the line instead.
        'deny-harmful': { passed: true, check: 'dotenv' },
      },
      'append-env': { passed: true, check: 'dotenv' },
    },
  },
  fixes: {
    'npm-not-recognized': {
      'look-here > fresh-tab': { passed: true, check: 'fresh' },
      'look-here > new-terminal': { passed: true, check: 'fresh' },
      // Node is gone: a fresh PATH names a folder that isn't there any more.
      'reinstall > fresh-tab': { passed: false, check: 'gone' },
    },
    'saved-for-new-terminals': {
      'trust-the-save > fresh-in-api': { passed: true, check: 'ready' },
      'print-here > fresh-in-api': { passed: true, check: 'ready' },
      // A new terminal sees QUILL_ENV, but it opens at home.
      'print-here > open-one': { passed: false, check: 'home' },
    },
    'make-it-last': {
      'replace-env > put-port-back': { passed: true, check: 'dotenv' },
      'prove-it > append-env': { passed: true, check: 'dotenv' },
      'prove-it > put-port-back': { passed: false, check: 'nowhere' },
    },
  },
  // Allowed, Otto deleted Node: no card brings it back, only Rewind (or a real reinstall).
  rewindOnly: ['npm-not-recognized > reinstall'],
  gates: {
    // Step 1: removing Node is harmful wherever it comes: the guard keeps Node installed.
    [`npm-not-recognized > reinstall > ${REMOVE_NODE}`]: true,
    [`npm-not-recognized > look-here > reinstall > ${REMOVE_NODE}`]: true,
    // Step 2 never pauses: opening terminals and reading variables change nothing saved.
    // Step 3: replacing .env loses PORT. Appends don't pause in this mission's mode.
    [`make-it-last > replace-env > ${REPLACE_ENV}`]: true,
    [`make-it-last > prove-it > replace-env > ${REPLACE_ENV}`]: true,
  },
});

describeJudgmentDrills(missionById('every-terminal'), {
  'etw-predict-new-tab': { key: ['dev'], wrong: 'empty' },
  'etw-predict-old-tab': { key: ['empty'], wrong: 'dev' },
  'etw-diagnose-stale-tab': { key: ['stale'], wrong: 'missing' },
  'etw-diagnose-claim-tab': { key: ['only-ps1'], wrong: 'right' },
  'etw-diagnose-export': { key: ['bash'], wrong: 'new-only' },
  'etw-approve-replace-env': { key: ['deny'], wrong: 'allow' },
  'etw-approve-append-env': { key: ['allow'], wrong: 'deny' },
  'etw-fix-stale-path': { key: ['new-tab'], wrong: 'reinstall' },
});
