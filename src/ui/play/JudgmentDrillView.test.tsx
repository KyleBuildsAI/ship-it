import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { shuffleFor } from '../../game/missions/judgment';
import { sampleJudgmentDrillsInput } from '../../game/missions/sample.test-mission';
import { JudgmentDrillSchema, type JudgmentDrill } from '../../game/missions/schema';
import type { DrillResult } from '../../game/play/playStore';
import type { Store } from '../../game/store';
import { JudgmentDrillView, JudgmentReveal, ScenePlaying } from './JudgmentDrillView';
import { actionText, attemptsBefore } from './judgmentText';

// Rendered to an HTML string, as in ActMenu.test.tsx: the real hook has no server
// snapshot, so here it just reads the store. No save is loaded, so every drill is on its
// first attempt.
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

function drill(id: string): JudgmentDrill {
  const input = sampleJudgmentDrillsInput.find((sample) => sample.id === id);
  if (input === undefined) throw new Error(`no sample drill "${id}"`);
  return JudgmentDrillSchema.parse(input);
}

/** Markup with the tags taken out, so tests read what Kyle reads. */
function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ');
}

function card(shown: JudgmentDrill, secondsLeft = 30): string {
  return renderToStaticMarkup(
    <JudgmentDrillView
      drill={shown}
      eyebrow="Drill 1 of 2"
      secondsLeft={secondsLeft}
      onAnswer={() => undefined}
    />,
  );
}

function reveal(shown: JudgmentDrill, result: Partial<DrillResult>): string {
  const full: DrillResult = {
    drillId: shown.id,
    passed: false,
    seconds: 12,
    overtime: false,
    ...result,
  };
  return text(renderToStaticMarkup(<JudgmentReveal drill={shown} result={full} />));
}

describe('actionText', () => {
  it('shows a line as typed, and every other action in words', () => {
    expect(actionText({ do: 'run', line: 'cd api' })).toBe('cd api');
    expect(actionText({ do: 'write', path: 'Users/kyle/a.txt', content: '' })).toBe(
      'Write the file C:\\Users\\kyle\\a.txt',
    );
    expect(actionText({ do: 'newTerminal' })).toBe('Open a new terminal');
    expect(actionText({ do: 'useTerminal', tab: 2 })).toBe('Switch to terminal 2');
  });
});

describe('attemptsBefore', () => {
  it("counts only this drill's earlier answers", () => {
    const history = [{ drillId: 'a' }, { drillId: 'b' }, { drillId: 'a' }];
    expect(attemptsBefore(history, 'a')).toBe(2);
    expect(attemptsBefore(history, 'c')).toBe(0);
  });
});

describe('the judgment drill card', () => {
  it('shows a predict drill: the line Otto will run, and every option', () => {
    const predict = drill('sample-predict-typo');
    const shown = text(card(predict));
    expect(shown).toContain('Drill 1 of 2');
    expect(shown).toContain('0:30');
    expect(shown).toContain('Otto is about to run this. What happens?');
    expect(shown).toContain('cd quilwork\\api');
    for (const option of predict.kind === 'predict' ? predict.options : []) {
      expect(shown).toContain(option.text);
    }
    expect(shown).not.toContain('Allow');
  });

  it("lists the options in this attempt's shuffled order", () => {
    const diagnose = drill('sample-diagnose-home');
    if (diagnose.kind !== 'diagnose') throw new Error('expected a diagnose drill');
    const order = shuffleFor(diagnose.id, 0)(diagnose.options).map((option) => option.text);
    const shown = text(card(diagnose));
    const places = order.map((label) => shown.indexOf(label));
    expect(places).toEqual([...places].sort((left, right) => left - right));
  });

  it("shows Otto's claim on a fix drill", () => {
    expect(text(card(drill('sample-fix-cd')))).toContain("Done: I'm in the API folder.");
  });

  it("asks allow or deny on an approve drill, with Otto's words and no effects list", () => {
    const shown = text(card(drill('sample-approve-notes')));
    expect(shown).toContain('Remove-Item notes -Recurse');
    expect(shown).toContain('Tidying the old notes folder.');
    expect(shown).toContain('Allow');
    expect(shown).toContain('Deny');
    expect(shown).not.toContain('What it changes');
  });

  it('takes no click for a moment, so a double-click never answers it', () => {
    expect(card(drill('sample-approve-notes'))).toContain('disabled');
  });

  it('empties the bar as the clock runs down', () => {
    expect(card(drill('sample-approve-notes'), 35)).toContain('width:100%');
    expect(card(drill('sample-approve-notes'), -3)).toContain('width:0%');
  });
});

describe('the reveal', () => {
  it('names the right answer after a miss, then explains it', () => {
    const shown = reveal(drill('sample-predict-typo'), { keyId: 'error' });
    expect(shown).toContain('Missed');
    expect(shown).toContain('The right answer: An error, and Otto stays at home');
    expect(shown).toContain('quilwork is misspelled');
    expect(shown).toContain('Standup Board');
  });

  it('names Deny as the answer to an approve drill', () => {
    const shown = reveal(drill('sample-approve-notes'), { keyId: 'deny' });
    expect(shown).toContain('The right answer: Deny');
  });

  it('says Right, with no answer line, when Kyle got it', () => {
    const shown = reveal(drill('sample-approve-stray'), { passed: true, keyId: 'allow' });
    expect(shown).toContain('Right');
    expect(shown).not.toContain('The right answer');
    expect(shown).not.toContain('Standup Board');
  });

  it('explains a drill that ran out of time, which has no answer to grade', () => {
    const shown = reveal(drill('sample-fix-cd'), { overtime: true, seconds: 51 });
    expect(shown).toContain('Out of time');
    expect(shown).not.toContain('The right answer');
    expect(shown).toContain('A full path works from anywhere');
  });
});

describe('a scene playing', () => {
  it('says the clock waits for Otto', () => {
    const shown = text(renderToStaticMarkup(<ScenePlaying label="Drill 2 of 2" />));
    expect(shown).toContain('Drill 2 of 2');
    expect(shown).toContain('The clock starts when Otto stops.');
  });
});
