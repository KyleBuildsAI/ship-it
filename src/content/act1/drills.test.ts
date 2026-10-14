import { describeJudgmentDrills } from './directed.test-helpers';
import { missionById } from './play.test-helpers';

/* Mission 1.1's judgment drills, each with the key its author meant (directed.test-helpers.ts). */

describeJudgmentDrills(missionById('where-things-live'), {
  'wtl-predict-typo-cd': { key: ['error'], wrong: 'lands' },
  'wtl-predict-fresh-terminal': { key: ['home'], wrong: 'api' },
  'wtl-predict-dotdot': { key: ['api'], wrong: 'quillwork' },
  'wtl-diagnose-no-package': { key: ['home'], wrong: 'deleted' },
  'wtl-diagnose-claim-todo': { key: ['home'], wrong: 'right' },
  'wtl-fix-web-notes': { key: ['one-up', 'full'], wrong: 'by-name' },
  'wtl-approve-stray': { key: ['allow'], wrong: 'deny' },
  'wtl-approve-real-notes': { key: ['deny'], wrong: 'allow' },
});
