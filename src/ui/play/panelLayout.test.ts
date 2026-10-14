import { describe, expect, it } from 'vitest';
import { startRun } from '../../game/missions/runner';
import { sampleMission } from '../../game/missions/sample.test-mission';
import type { MissionActivity } from '../../game/play/playStore';
import { panelClassName } from './panelLayout';

function missionAt(phase: MissionActivity['run']['phase']): MissionActivity {
  return {
    kind: 'mission',
    attempt: 1,
    mission: sampleMission,
    run: { ...startRun(sampleMission), phase },
    hint: null,
    hintLoading: false,
    lastDrill: null,
    questionScore: null,
    freeTextGrade: null,
    xpEarned: 0,
    agent: null,
    stars: {},
    slips: [],
    scene: null,
  };
}

describe('the play panel layout', () => {
  it('sits above an open terminal while the terminal is in use', () => {
    expect(panelClassName(true, missionAt('sim'))).toContain('play-panel--above-terminal');
    expect(panelClassName(true, null)).toContain('play-panel--above-terminal');
  });

  it('keeps its full height for the Question Round, which never uses the terminal', () => {
    const className = panelClassName(true, missionAt('question'));
    expect(className).toContain('play-panel--over-terminal');
    expect(className).not.toContain('play-panel--above-terminal');
  });

  it('needs neither when the terminal is hidden', () => {
    expect(panelClassName(false, missionAt('question'))).toBe('glass play-panel');
  });
});
