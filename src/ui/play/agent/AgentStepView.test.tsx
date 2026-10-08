import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginAgentStep,
  choosePlan,
  echoPlan,
  type AgentStepState,
} from '../../../game/missions/agentRunner';
import { finishBriefing, startRun } from '../../../game/missions/runner';
import { notesMission } from '../../../game/missions/sample.test-mission';
import type { MissionStep } from '../../../game/missions/schema';
import { ottoRun, type OttoRun } from '../../../game/play/agentPlay';
import type { MissionActivity } from '../../../game/play/playStore';
import type { Store } from '../../../game/store';
import { AgentStepView } from './AgentStepView';

// Rendered to an HTML string, as in ActMenu.test.tsx: the real hook has no server
// snapshot, so here it just reads the store.
vi.mock('../../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

function notesStep(): MissionStep {
  const [first] = notesMission.steps;
  if (first === undefined) throw new Error('the notes sample has a step');
  return first;
}
const step = notesStep();

function activity(agent: AgentStepState): MissionActivity {
  return {
    kind: 'mission',
    attempt: 1,
    mission: notesMission,
    run: finishBriefing(startRun(notesMission)),
    hint: null,
    hintLoading: false,
    lastDrill: null,
    questionScore: null,
    freeTextGrade: null,
    xpEarned: 0,
    agent,
    stars: {},
    scene: null,
  };
}

/** The panel as Kyle sees it, as plain text with the markup taken out. */
function shown(agent: AgentStepState, hintLevel = 0, run: Partial<OttoRun> = {}): string {
  ottoRun.update({ rows: [], last: null, ...run });
  const markup = renderToStaticMarkup(
    <AgentStepView activity={activity(agent)} step={step} hintLevel={hintLevel} />,
  );
  return markup
    .replace(/<button[^>]*>/g, '[')
    .replace(/<\/button>/g, ']')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&#x27;', "'");
}

afterEach(() => {
  ottoRun.update({ rows: [], last: null });
});

describe('the directing panel', () => {
  const start = beginAgentStep(step);

  it('offers the cards with Otto waiting, and marks the card the last hint names', () => {
    expect(shown(start)).toBe(
      "•Otto: I'm Otto. Scripted for this course, so my slips teach." +
        '[Make a notes folder for the API.]' +
        '[Make C:\\Users\\kyle\\quillwork\\api\\notes.]',
    );
    expect(shown(start, 3)).toContain('[Make C:\\Users\\kyle\\quillwork\\api\\notes.Hint]');
  });

  it('asks Kyle to confirm a card said back', () => {
    expect(shown(echoPlan(start, step, 'bare-name'))).toBe(
      '•Otto: Plan: Make a notes folder for the API. Go?[Go][Pick instead]',
    );
  });

  it("shows Otto's run log while he works, with Stop", () => {
    const rows = [
      { text: 'mkdir notes', answer: false, status: 'failed' },
      { text: 'A', answer: true, status: 'ok' },
      { text: null, answer: false, status: 'denied' },
    ] as const;
    const text = shown(choosePlan(start, step, 'full-path'), 0, { rows });
    expect(text).toContain('mkdir notes (failed)');
    expect(text).toContain('Answered A (ran)');
    expect(text).toContain('Wrote a file (denied, never ran)');
    expect(text).toContain('[Stop]');
  });

  it('shows nothing for a typed step', () => {
    const markup = renderToStaticMarkup(
      <AgentStepView activity={{ ...activity(start), agent: null }} step={step} hintLevel={0} />,
    );
    expect(markup).toBe('');
  });
});
