import type { ActInput, MissionInput } from '../../game/missions/schema';
import { dirtyTreeFinal } from './dirtyTreeFinal';
import { cleanTheDirtyTree } from './fieldMission';
import { goodCommits } from './goodCommits';
import { ignoreList } from './ignoreList';
import { readingHistory } from './readingHistory';
import { threeRooms } from './threeRooms';
import { undoEverything } from './undoEverything';

/** Act 2's missions in play order (DESIGN.md section 11). */
export const act2MissionInputs: readonly MissionInput[] = [
  threeRooms,
  readingHistory,
  goodCommits,
  ignoreList,
  undoEverything,
];

/**
 * Act 2 plays its directed missions, then its timed final, which stands in for the boss
 * like every other Act's (it was a typed boss fight before). Its placement test is
 * judgment drills from the missions, so a pass tests out of all five and completes the Act.
 */
export const act2Input: ActInput = {
  act: 2,
  title: 'Git Core',
  missionIds: [...act2MissionInputs, dirtyTreeFinal].map((part) => part.id),
  finalLessonId: dirtyTreeFinal.id,
  placementTest: {
    pitch: 'Already know git? 85% tests out of the Act.',
    // Two or three judgment drills per mission, so testing out still proves every idea in
    // the Act, all answered by clicking. The kinds are mixed (3 predict, 3 diagnose, 4
    // fix, 2 approve) so a pass needs reading git output and weighing Otto's lines, not
    // one skill. Of the two approve drills one is denied and one allowed, so "always deny"
    // can't carry it.
    drillIds: [
      'rooms-commit-staged-only',
      'rooms-diagnose-staged',
      'history-old-port',
      'history-staged-surprise',
      'history-debug-print',
      'commits-split-two',
      'commits-am-trap',
      'ignore-approve-rm-cached',
      'ignore-diagnose-leak',
      'undo-soft-reset',
      'undo-revert-shared',
      'undo-reflog-rescue',
    ],
  },
  fieldMission: cleanTheDirtyTree,
};
