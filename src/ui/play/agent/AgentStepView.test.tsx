import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginAgentStep,
  choosePlan,
  echoPlan,
  nextAction,
  openGate,
  type AgentStepState,
  type Gate,
  type QueuedAction,
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
      { text: 'mkdir notes', typed: true, answer: false, status: 'failed' },
      { text: 'A', typed: true, answer: true, status: 'ok' },
      { text: 'Opened a new terminal', typed: false, answer: false, status: 'ok' },
      { text: 'Wrote README.md', typed: false, answer: false, status: 'denied' },
    ] as const;
    const text = shown(choosePlan(start, step, 'full-path'), 0, { rows });
    expect(text).toContain('mkdir notes (failed)');
    expect(text).toContain('Answered A (ran)');
    // Actions that type nothing are named by what they did, not all called a file write.
    expect(text).toContain('Opened a new terminal (ran)');
    expect(text).toContain('Wrote README.md (denied, never ran)');
    expect(text).toContain('[Stop]');
  });

  it('waits for a prediction with the line shown and every option a button', () => {
    const taken = nextAction(choosePlan(start, step, 'bare-name'));
    expect(shown(taken?.state ?? start)).toBe(
      '•Otto: Before I run it: what do you think happens?' +
        'Predictmkdir notesBefore Otto runs it: where will notes land?' +
        '[In the API folder][In C:\\Users\\kyle][Nowhere: it fails]',
    );
  });

  /** Otto at a gate for `action`, in a fix round's start-over plan. */
  function atGate(action: QueuedAction, gate: Gate): AgentStepState {
    const fixing = { ...start, stage: { at: 'direct', round: 'fix' } } as const;
    const taken = nextAction(choosePlan(fixing, step, 'start-over'));
    if (taken === null) throw new Error('start-over has lines');
    return openGate(taken.state, action, gate);
  }

  it('shows a gate with what the dry run changes, and Allow and Deny alike', () => {
    const line = 'Remove-Item C:\\Users\\kyle\\quillwork\\api';
    const answer = { do: 'answer', choice: 'A', line, onDeny: [], refusal: false } as const;
    const deleted = {
      kind: 'deleted',
      item: 'folder',
      path: 'Users/kyle/quillwork/api',
      inside: 1,
    } as const;
    const gate = { kind: 'confirm', line, changes: [deleted], harmful: true } as const;
    const text = shown(atGate(answer, gate));
    expect(text).toContain('PowerShell asks before it goes on with:' + line);
    expect(text).toContain('Otto will answer A (Yes to All).');
    expect(text).toContain('Deletes C:\\Users\\kyle\\quillwork\\api and 1 item inside');
    // Both buttons look the same: the card never hints that this one is harmful.
    expect(text).toContain('[Allow][Deny]');
  });

  it('shows each new gate and prediction with its buttons not yet taking clicks', () => {
    // A double-click must not decide a card that appeared between its two clicks.
    const run = { do: 'run', line: 'Get-Content .env', onDeny: [] } as const;
    const gate = atGate(run, { kind: 'line', line: run.line, changes: [], harmful: false });
    const markup = (agent: AgentStepState) =>
      renderToStaticMarkup(<AgentStepView activity={activity(agent)} step={step} hintLevel={0} />);
    const disabled = (html: string) => html.match(/<button[^>]*disabled=""/g)?.length ?? 0;
    expect(disabled(markup(gate))).toBe(2);
    const predicting = nextAction(choosePlan(start, step, 'bare-name'))?.state ?? start;
    expect(disabled(markup(predicting))).toBe(3);
  });

  it('says so when a line Otto asks about changes nothing the laptop shows', () => {
    const run = { do: 'run', line: 'Get-Content .env', onDeny: [] } as const;
    const text = shown(atGate(run, { kind: 'line', line: run.line, changes: [], harmful: false }));
    expect(text).toContain('Otto wants to run:Get-Content .env');
    expect(text).toContain('The laptop shows no change, but Otto asked first.');
  });

  it('shows nothing for a typed step', () => {
    const markup = renderToStaticMarkup(
      <AgentStepView activity={{ ...activity(start), agent: null }} step={step} hintLevel={0} />,
    );
    expect(markup).toBe('');
  });
});
