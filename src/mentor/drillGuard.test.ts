import { afterEach, describe, expect, it } from 'vitest';
import { activeDrillSession, beginDrill, endDrill } from './drillGuard';

describe('drill guard', () => {
  afterEach(() => {
    endDrill();
  });

  it('has no active drill to begin with', () => {
    expect(activeDrillSession()).toBeNull();
  });

  it('remembers the running drill until it ends', () => {
    beginDrill('placement-act-2');
    expect(activeDrillSession()).toBe('placement-act-2');

    endDrill();
    expect(activeDrillSession()).toBeNull();
  });
});
