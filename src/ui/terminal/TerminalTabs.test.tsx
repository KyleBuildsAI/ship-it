import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { folder, windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { TerminalTabs } from './TerminalTabs';

// These render to an HTML string, the way a server would, so no browser is needed.
describe('TerminalTabs', () => {
  it("lists a laptop's tabs in order, the active one marked, each with its folder", () => {
    const ws = windows().session().cd('Users/kyle/quillwork/app').build(testDeps());
    ws.machine?.openSession();
    expect(renderToStaticMarkup(<TerminalTabs ws={ws} readOnly={false} />)).toBe(
      '<div class="terminal-tabs"><ol aria-label="Terminal tabs">' +
        '<li title="C:\\Users\\kyle\\quillwork\\app">PS 1</li>' +
        '<li title="C:\\Users\\kyle" aria-current="true">PS 2</li>' +
        '</ol></div>',
    );
  });

  it('says so while Otto has the terminal', () => {
    const ws = windows().build(testDeps());
    expect(renderToStaticMarkup(<TerminalTabs ws={ws} readOnly />)).toContain(
      '<span class="terminal-tabs__note">Read-only while Otto works</span>',
    );
  });

  it("draws nothing for Act 2's sandboxes, which have no laptop", () => {
    const ws = folder().build(testDeps());
    expect(renderToStaticMarkup(<TerminalTabs ws={ws} readOnly={false} />)).toBe('');
  });
});
