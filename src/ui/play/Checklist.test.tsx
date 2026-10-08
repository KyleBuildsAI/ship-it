import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Checklist } from './Checklist';

const ROWS = [
  { label: 'A notes folder exists', passed: true },
  { label: 'The API is intact', passed: false },
] as const;

describe('Checklist', () => {
  it('shows an open row as still to do while Kyle works (the typed-mission look)', () => {
    const markup = renderToStaticMarkup(<Checklist rows={ROWS} />);
    expect(markup).toContain('○');
    expect(markup).toContain('(not yet)');
    expect(markup).not.toContain('checklist__failed');
  });

  it('shows an open row as failed on a result', () => {
    const markup = renderToStaticMarkup(<Checklist rows={ROWS} result />);
    expect(markup).toContain('<li class="checklist__failed">');
    expect(markup).toContain('✗');
    expect(markup).toContain('The API is intact<span class="visually-hidden"> (not met)</span>');
    expect(markup).toContain('(done)');
  });

  it('shows nothing without rows', () => {
    expect(renderToStaticMarkup(<Checklist rows={[]} result />)).toBe('');
  });
});
