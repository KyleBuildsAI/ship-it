import { describe, expect, it } from 'vitest';
import type { AgentTask } from '../game/missions/agentSchema';
import { act1Missions, act2Missions } from './index';

/*
 * The terminal stays put away while Kyle directs Otto (DESIGN.md section 14), so what a
 * check's feedback sends him to read must be on screen: a look (its line and output show
 * under the chips), Otto's run log, or the island. These guard the ways it slipped before.
 */

/** Every directed step of Acts 1 and 2, named for the failure message. */
const steps = [...act1Missions, ...act2Missions].flatMap((mission) =>
  mission.steps.flatMap((step) =>
    step.agent === undefined ? [] : [{ name: `${mission.id} > ${step.id}`, task: step.agent }],
  ),
);

/** What a step tells Kyle after its check: each option's feedback, and each card's lesson. */
function afterTheCheck(task: AgentTask): string[] {
  return [
    ...task.check.options.map((option) => option.feedback),
    ...[...task.plans, ...task.fixes].map((plan) => plan.lesson),
  ];
}

/** The git commands a step's looks run, by their first two words: "git status". */
function lookCommands(task: AgentTask): Set<string> {
  return new Set(task.looks.map((look) => look.line.split(' ').slice(0, 2).join(' ')));
}

const GIT_COMMAND = /\bgit (?:status|log|diff|show|reflog|branch|stash|ls-files)\b/g;
/** A sentence that says what a command printed, rather than what it does. */
const SAYS_WHAT_IT_PRINTED = /\b(?:shows|lists|says|starts with|ends at|is missing)\b/;

describe('directed check feedback', () => {
  it('finds the directed steps of both Acts', () => {
    expect(steps.length).toBeGreaterThan(15);
  });

  it('never points at what only the closed terminal shows', () => {
    // Otto's own output ("the PATH Otto printed", "the listing of ..\web") and the
    // terminal's tab strip are drawn only in the terminal. That Otto printed a secret is a
    // fact about his context, not a place to look, so it may still be said.
    const terminalOnly = /Directory line|tab strip|the \S+ Otto printed|the listing\b/i;
    for (const { name, task } of steps) {
      for (const text of afterTheCheck(task)) expect(text, name).not.toMatch(terminalOnly);
    }
  });

  it('sends a hint, read before any look can run, to the island rather than the prompt', () => {
    // Hints come while Kyle picks a card: no look has run, so no prompt is on screen yet.
    for (const mission of [...act1Missions, ...act2Missions]) {
      for (const step of mission.steps) {
        if (step.agent === undefined) continue;
        for (const hint of step.hints) {
          expect(hint, `${mission.id} > ${step.id}`).not.toMatch(/\bthe prompt\b/i);
        }
      }
    }
  });

  it("names only a git command one of the step's looks runs, when it says what it printed", () => {
    for (const { name, task } of steps) {
      const runnable = lookCommands(task);
      for (const option of task.check.options) {
        for (const sentence of option.feedback.split(/(?<=\.)\s+/)) {
          if (!SAYS_WHAT_IT_PRINTED.test(sentence)) continue;
          for (const [command] of sentence.matchAll(GIT_COMMAND)) {
            expect(runnable.has(command), `${name} > ${option.id}: ${command}`).toBe(true);
          }
        }
      }
    }
  });

  it('sends Kyle only to looks the step has, when it opens with one', () => {
    for (const { name, task } of steps) {
      const labels = task.looks.map((look) => look.label);
      for (const option of task.check.options) {
        if (!/^(?:List|Show|Print) /.test(option.feedback)) continue;
        const named = labels.some((label) => option.feedback.startsWith(label));
        expect(named, `${name} > ${option.id}: ${option.feedback}`).toBe(true);
      }
    }
  });
});
