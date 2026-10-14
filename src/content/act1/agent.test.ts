import { describeDirectedMission } from './directed.test-helpers';
import { missionById } from './play.test-helpers';

/*
 * Mission 1.1 played card by card (directed.test-helpers.ts). The tables below are what
 * the spec says each card does; the suite proves the engine agrees.
 */

describeDirectedMission(missionById('where-things-live'), {
  start: {
    'stand-in-the-api': {
      guess: { passed: false, check: 'home' },
      'step-by-step': { passed: true, check: 'api' },
      'full-path': { passed: true, check: 'api' },
    },
    'notes-in-the-api': {
      'bare-name': { passed: false, check: 'home' },
      'full-path': { passed: true, check: 'api' },
      'go-then-make': { passed: true, check: 'api' },
    },
    'web-notes': {
      'by-name': { passed: false, check: 'inside' },
      'one-up': { passed: true, check: 'next-door' },
      full: { passed: true, check: 'next-door' },
    },
    'two-terminals': {
      'open-one': { passed: false, check: 'api-and-home' },
      'move-here': { passed: false, check: 'moved' },
      'open-and-go': { passed: true, check: 'api-and-web' },
    },
  },
  fixes: {
    'stand-in-the-api': { 'guess > fix-full-path': { passed: true, check: 'api' } },
    'notes-in-the-api': {
      'bare-name > tidy-and-redo': { passed: true, check: 'api' },
      'bare-name > just-redo': { passed: false, check: 'both' },
    },
    'web-notes': {
      'by-name > tidy-web': { passed: true, check: 'next-door' },
      'by-name > one-up': { passed: false, check: 'both' },
    },
    'two-terminals': {
      'open-one > go-in-new': { passed: true, check: 'api-and-web' },
      'open-one > back-and-open': { passed: true, check: 'api-and-web' },
      'move-here > back-and-open': { passed: true, check: 'api-and-web' },
      'move-here > go-in-new': { passed: false, check: 'moved' },
    },
  },
  gates: {
    'notes-in-the-api > bare-name > tidy-and-redo > Remove-Item C:\\Users\\kyle\\notes': false,
    'web-notes > by-name > tidy-web > Remove-Item web -Recurse': false,
  },
});
