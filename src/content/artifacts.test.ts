import { describe, expect, it } from 'vitest';
import { ACTS } from '.';

describe('the artifacts lesson cards show', () => {
  it('captions an issue as an issue, since Act 4 teaches how issues and PRs differ', () => {
    const miscaptioned: string[] = [];
    for (const content of ACTS) {
      for (const lesson of content.lessons) {
        for (const card of lesson.cards) {
          const artifact = card.artifact;
          // The box shows the kind's caption beside the label, so "Issue #61" under a
          // "Pull request" caption called an issue a PR.
          if (artifact?.label !== undefined && /^issue #\d+/i.test(artifact.label)) {
            if (artifact.kind !== 'issue') {
              miscaptioned.push(`${lesson.id}/${card.id}: ${artifact.kind}`);
            }
          }
        }
      }
    }
    expect(miscaptioned).toEqual([]);
  });
});
