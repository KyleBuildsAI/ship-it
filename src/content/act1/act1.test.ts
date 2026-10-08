import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { dryRun, startLog, withEntry, type SandboxLog } from '../../game/agent/replay';
import { outcomeHolds } from '../../game/missions/agentRunner';
import { isJudgmentDrill } from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { act1, act1Missions } from './index';

const mission = act1Missions[0];
if (mission === undefined) throw new Error('Act 1 has no mission');

describe('Act 1', () => {
  it('parses, ships Mission 1.1 in early access, and passes validateAct', () => {
    expect(act1.earlyAccess).toBe(true);
    expect(act1.missionIds).toEqual(['where-things-live']);
    expect(act1.upcoming).toHaveLength(5);
    expect(validateAct(act1, act1Missions)).toEqual([]);
  });
});

describe('Mission 1.1, Where Things Live, as a directed mission', () => {
  it('has 3-5 steps, every one directed, and pauses Otto before deletes', () => {
    expect(mission.approvals).toBe('destructive');
    expect(mission.steps.length).toBeGreaterThanOrEqual(3);
    expect(mission.steps.length).toBeLessThanOrEqual(5);
    for (const step of mission.steps) expect(step.agent, step.id).toBeDefined();
  });

  it('has 5-8 judgment drills of at least 3 kinds, each 30-60 seconds', () => {
    const drills = mission.drills.filter(isJudgmentDrill);
    expect(drills).toHaveLength(mission.drills.length);
    expect(drills.length).toBeGreaterThanOrEqual(5);
    expect(drills.length).toBeLessThanOrEqual(8);
    expect(new Set(drills.map((drill) => drill.kind)).size).toBeGreaterThanOrEqual(3);
    for (const drill of drills) {
      expect(drill.id.startsWith('wtl-'), drill.id).toBe(true);
      expect(drill.timeLimitSeconds).toBeGreaterThanOrEqual(30);
      expect(drill.timeLimitSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('gives the Question Round strong, okay and weak questions', () => {
    const qualities = new Set(mission.questionRound.candidates.map((entry) => entry.quality));
    expect([...qualities].sort()).toEqual(['okay', 'strong', 'weak']);
  });
});

describe("Mission 1.1's bare-name prediction", () => {
  const step = mission.steps.find((found) => found.id === 'notes-in-the-api');
  const plan = step?.agent?.plans.find((found) => found.id === 'bare-name');
  const [first] = plan?.script ?? [];
  const predicted = first?.do === 'run' && 'predict' in first ? first : undefined;
  if (step?.agent === undefined || predicted?.predict === undefined) {
    throw new Error('notes-in-the-api has a bare-name card with a predicted line');
  }
  const setup = mission.initialRepoState;
  const before = step.agent.before;
  const judge = { guards: step.agent.guards };
  const { line } = predicted;
  const { options } = predicted.predict;
  const API_PATH = 'C:\\Users\\kyle\\quillwork\\api';

  /** The step's start, then the lines an earlier card ran before Kyle pressed Stop. */
  const arrive = (lines: readonly string[]): SandboxLog =>
    lines.reduce<SandboxLog>(
      (log, ran) => withEntry(log, { kind: 'action', action: { do: 'run', line: ran } }),
      withEntry(startLog(setup), { kind: 'steps', steps: before }),
    );

  const trueOptions = (log: SandboxLog): string[] => {
    const dry = dryRun(log, { do: 'run', line }, judge, testDeps());
    return options
      .filter((option) => outcomeHolds(option.outcome, dry.step, dry.queries))
      .map((option) => option.id);
  };

  // A fix round offers bare-name after a Stop, so it can run after part of another card.
  it.each([
    ['a fresh terminal at home', [], 'home'],
    ['full-path stopped after its mkdir', [`mkdir ${API_PATH}\\notes`], 'home'],
    ['go-then-make stopped after its cd', [`cd ${API_PATH}`], 'api'],
    ['go-then-make stopped after its mkdir', [`cd ${API_PATH}`, 'mkdir notes'], 'fails'],
  ])('has exactly one true option after %s', (_, lines, want) => {
    expect(trueOptions(arrive(lines))).toEqual([want]);
  });
});
