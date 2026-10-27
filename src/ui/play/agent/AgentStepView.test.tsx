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
  type Verdict,
} from '../../../game/missions/agentRunner';
import { finishBriefing, startRun } from '../../../game/missions/runner';
import { notesMission } from '../../../game/missions/sample.test-mission';
import type { MissionStep } from '../../../game/missions/schema';
import { ottoRun, trueCheckOptions, type OttoRun } from '../../../game/play/agentPlay';
import type { MissionActivity } from '../../../game/play/playStore';
import type { Store } from '../../../game/store';
import { AgentStepView } from './AgentStepView';

// Rendered to an HTML string, as in ActMenu.test.tsx: the real hook has no server
// snapshot, so here it just reads the store.
vi.mock('../../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

// The true check option comes from the live laptop, which these tests don't build:
// play.test.ts proves trueCheckOptions itself. Here, "home" is what's true unless a test
// says otherwise.
vi.mock('../../../game/play/agentPlay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../game/play/agentPlay')>()),
  trueCheckOptions: vi.fn(() => ['home']),
}));

function notesStep(): MissionStep {
  const [first] = notesMission.steps;
  if (first === undefined) throw new Error('the notes sample has a step');
  return first;
}
const step = notesStep();

/** The checklist play would pass at a result: the panel shows it as given. */
const CHECKLIST = [{ label: 'The API has a notes folder', passed: false }] as const;

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
    slips: [],
    scene: null,
  };
}

/** The panel as Kyle sees it, as plain text with the markup taken out. */
function shown(
  agent: AgentStepState,
  hintLevel = 0,
  run: Partial<OttoRun> = {},
  extra: Partial<MissionActivity> = {},
): string {
  ottoRun.update({ rows: [], last: null, ...run });
  const markup = renderToStaticMarkup(
    <AgentStepView
      activity={{ ...activity(agent), ...extra }}
      step={step}
      hintLevel={hintLevel}
      checklist={CHECKLIST}
    />,
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
      renderToStaticMarkup(
        <AgentStepView activity={activity(agent)} step={step} hintLevel={0} checklist={[]} />,
      );
    const disabled = (html: string) => html.match(/<button[^>]*disabled=""/g)?.length ?? 0;
    expect(disabled(markup(gate))).toBe(2);
    const predicting = nextAction(choosePlan(start, step, 'bare-name'))?.state ?? start;
    expect(disabled(markup(predicting))).toBe(3);
  });

  it('says so when a line Otto asks about changes nothing the laptop shows', () => {
    const run = { do: 'run', line: 'Get-Content .env', onDeny: [] } as const;
    const text = shown(atGate(run, { kind: 'line', line: run.line, changes: [], harmful: false }));
    expect(text).toContain('Otto wants to run:Get-Content .env');
    expect(text).toContain('The dry run shows no change, but Otto asked first.');
  });

  it('tells an edit of one piece apart from a write of the whole file', () => {
    const path = 'Users/kyle/quillwork/api/config.json';
    // Play names the file on the gate's line the way Windows prints it (agentPlay's gateLine).
    const line = 'C:\\Users\\kyle\\quillwork\\api\\config.json';
    const changes = [{ kind: 'modified', path, how: 'replaced' }] as const;
    const gate = { kind: 'line', line, changes, harmful: false } as const;
    const edit = { do: 'edit', path, find: '8080', replace: '3000', onDeny: [] } as const;
    const edited = shown(atGate(edit, gate));
    expect(edited).toContain('Otto wants to edit the file:' + line);
    expect(edited).toContain('Changes 8080 to 3000, and keeps the rest.');
    // The dry run's line agrees: an edit changes part of the file, it doesn't overwrite it.
    expect(edited).toContain('Changes part of ' + line);
    expect(edited).not.toContain('Overwrites');
    const write = { do: 'write', path, content: '{}', onDeny: [] } as const;
    const written = shown(atGate(write, gate));
    expect(written).toContain('Otto wants to write the whole file:' + line);
    expect(written).toContain('Overwrites ' + line);
    expect(written).not.toContain('keeps the rest');
  });

  it("shows an edit's text without the line end it finds, which reads as a stray space", () => {
    const path = 'Users/kyle/quillwork/api/.env';
    const changes = [{ kind: 'modified', path, how: 'replaced' }] as const;
    const gate = { kind: 'line', line: path, changes, harmful: false } as const;
    const port = { do: 'edit', path, find: 'PORT=\n', replace: 'PORT=3000\n', onDeny: [] } as const;
    expect(shown(atGate(port, gate))).toContain('Changes PORT= to PORT=3000, and keeps the rest.');
    const cut = { do: 'edit', path, find: 'DEBUG=true\n', replace: '\n', onDeny: [] } as const;
    expect(shown(atGate(cut, gate))).toContain('Removes DEBUG=true, and keeps the rest.');
  });

  it("asks Kyle to check Otto's claim, with his looks beside the answers", () => {
    const checking: AgentStepState = { ...start, stage: { at: 'check', planId: 'bare-name' } };
    expect(shown(checking)).toBe(
      "•Otto: Done: notes is in the API project.Check Otto's claimWhere did notes land?" +
        'Look before you answer:[List home]' +
        '[Only in the API folder][In C:\\Users\\kyle, where fresh terminals start][In both places]',
    );
  });

  it("asks for Kyle's own part first, and opens the answers once it's done", () => {
    const task = step.agent;
    if (task === undefined) throw new Error('the notes sample is directed');
    const part = { label: 'Paste the key', path: 'Users/kyle/a.txt', find: 'x', replace: 'y' };
    const withPart: MissionStep = { ...step, agent: { ...task, yourPart: part } };
    const checking: AgentStepState = { ...start, stage: { at: 'check', planId: 'bare-name' } };
    const markup = (agent: AgentStepState) =>
      renderToStaticMarkup(
        <AgentStepView activity={activity(agent)} step={withPart} hintLevel={0} checklist={[]} />,
      );
    // Every button waits to arm; the answers also wait for the part.
    const pending = markup(checking);
    expect(pending).toContain('Your part');
    expect(pending).toContain('Paste the key');
    const done = markup({ ...checking, partDone: true });
    expect(done).not.toContain('Your part');
    expect(done).toContain('Where did notes land?');
  });

  /** A result for the weak card, Kyle having answered `optionId`. */
  function result(
    verdict: Verdict,
    optionId: string,
    passed: boolean,
    guardBroken = false,
  ): AgentStepState {
    const stage = {
      at: 'result',
      planId: 'bare-name',
      optionId,
      verdict,
      passed,
      guardBroken,
    } as const;
    return { ...start, tried: ['bare-name'], stage };
  }

  it('shows a good catch with the checklist, the anatomy, the slip and the lesson', () => {
    const met = { stepId: 'notes-in-the-api', planId: 'bare-name', slip: 'wrong-place' } as const;
    const text = shown(
      result('caught', 'home', false),
      0,
      {},
      {
        slips: [{ ...met, caught: true }],
      },
    );
    expect(text).toContain("Good catch. Otto's claim was wrong, and you saw it.");
    expect(text).toContain('The API has a notes folder (not met)');
    expect(text).toContain('Goal (had it)Place (missing)Limits (missing)Check (missing)');
    expect(text).toContain('Slip: wrong place');
    expect(text).toContain('A fresh terminal stands at home, so notes landed in C:\\Users\\kyle.');
    expect(text).toContain('[Direct a fix][Rewind step]');
    // Stars show only once the step passed: until then they're still being earned.
    expect(text).not.toContain('earned)');
  });

  it("shows a miss with the true option's evidence, and Rewind first when a guard broke", () => {
    const text = shown(result('missed', 'api', false, true));
    expect(text).toContain("Missed. Otto's claim was wrong.");
    // The evidence for what is true, never the picked option's, which would restate the
    // false answer; and not the card's lesson.
    expect(text).toContain('Read the Directory line above the table: it says where mkdir put it.');
    expect(text).not.toContain('the Directory line shows the API folder');
    expect(text).not.toContain('A fresh terminal stands at home');
    expect(text).toContain('The true answer: In C:\\Users\\kyle, where fresh terminals start');
    expect(text).toContain('[Rewind step][Direct a fix]');
    // The Plan star is gone whichever button Kyle picks, so the note claims no trade-off.
    expect(text).toContain('A real laptop has no rewind.');
    expect(text).not.toContain('Plan star');
  });

  it("explains a false alarm with what is true, not the picked option's claim", () => {
    // Kyle said notes were in both places; only home holds, and Otto was right.
    const text = shown(result('false-alarm', 'both', true));
    expect(text).toContain('False alarm. Otto was right this time.');
    expect(text).toContain('Read the Directory line above the table: it says where mkdir put it.');
    expect(text).not.toContain('Two Directory lines, two folders.');
  });

  it("falls back to the card's lesson when no option is true after a misread", () => {
    vi.mocked(trueCheckOptions).mockReturnValueOnce([]);
    const text = shown(result('missed', 'api', false));
    expect(text).toContain('A fresh terminal stands at home, so notes landed in C:\\Users\\kyle.');
    expect(text).not.toContain('The true answer');
  });

  it('draws the rows that fail at a result red, as broken rather than still to do', () => {
    ottoRun.update({ rows: [], last: null });
    const markup = renderToStaticMarkup(
      <AgentStepView
        activity={activity(result('missed', 'api', false, true))}
        step={step}
        hintLevel={0}
        checklist={[
          { label: 'The API has a notes folder', passed: true },
          { label: 'The API is intact', passed: false },
        ]}
      />,
    );
    expect(markup).toContain('<li class="checklist__failed">');
    expect(markup).toContain('✗');
    expect(markup).not.toContain('○');
    expect(markup).not.toContain('(not yet)');
    expect(markup).toContain('<li class="checklist__done">');
  });

  it('shows the stars a passed step earned, and Next step', () => {
    const stars = { 'notes-in-the-api': { plan: true, safety: true, check: false } };
    const text = shown(result('confirmed', 'api', true), 0, {}, { stars });
    expect(text).toContain('Confirmed. Otto was right, and you checked.');
    expect(text).toContain('Plan (earned)');
    expect(text).toContain('Check (not earned)');
    expect(text).toContain('[Next step]');
    expect(text).not.toContain('Rewind');
    // The weak card passed with nothing denied, so its slip never reached Kyle: the
    // card doesn't name one the Done screen won't count.
    expect(text).not.toContain('Slip:');
  });

  it('shows nothing for a typed step', () => {
    const markup = renderToStaticMarkup(
      <AgentStepView
        activity={{ ...activity(start), agent: null }}
        step={step}
        hintLevel={0}
        checklist={[]}
      />,
    );
    expect(markup).toBe('');
  });
});
