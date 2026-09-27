import type { ActInput, MissionInput } from '../../game/missions/schema';
import { dirtyTree } from './dirtyTree';
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

export const act2Input: ActInput = {
  act: 2,
  title: 'Git Core',
  missionIds: act2MissionInputs.map((mission) => mission.id),
  placementTest: {
    // Two or three drills per mission, so testing out still proves every idea in the Act.
    drillIds: [
      'rooms-stage-folder',
      'rooms-commit-staged-only',
      'history-old-port',
      'history-staged-surprise',
      'commits-split-two',
      'commits-am-trap',
      'ignore-tracked-dist',
      'ignore-negate',
      'undo-unstage',
      'undo-soft-reset',
      'undo-revert-shared',
      'undo-reflog-rescue',
    ],
  },
  boss: dirtyTree,
  fieldMission: cleanTheDirtyTree,
};
