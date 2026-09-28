import { openActMenu } from '../../game/hud';
import { startBossFight } from '../../game/play/bossPlay';
import { getAct, getCatalog } from '../../game/play/catalog';
import { startFieldMission } from '../../game/play/fieldPlay';
import { startMission } from '../../game/play/missionPlay';
import { missionDone } from '../../game/play/saveRules';
import { reviewItemsToday, startPlacement, startReview } from '../../game/play/seriesPlay';
import { progress } from '../../game/progress';
import { completedActNumbers, rankFor } from '../../game/progression/xp';
import type { MissionStatus } from '../../game/save/schema';
import { useStore } from '../useStore';

const STATUS: Record<MissionStatus, string> = {
  available: '',
  'in-progress': 'In progress',
  completed: 'Done',
  'tested-out': 'Tested out',
};

/** Tabs across the top of the menu, one per Act, once there's more than one. */
function ActTabs({ current }: { current: number }) {
  const { acts } = getCatalog();
  if (acts.length < 2) return null;
  return (
    <div className="act-tabs" role="tablist" aria-label="Acts">
      {acts.map(({ act }) => (
        <button
          key={act.act}
          type="button"
          role="tab"
          aria-selected={act.act === current}
          className="act-tabs__tab"
          onClick={() => {
            openActMenu(act.act);
          }}
        >
          Act {act.act}
        </button>
      ))}
    </div>
  );
}

/** An Act's menu: placement test, the missions, the boss, the Field Mission, and reviews. */
export function ActMenu({ act: number }: { act: number }) {
  const { save } = useStore(progress);
  if (save === null) return null;
  const { act, missions } = getAct(number);
  const actProgress = save.acts[String(act.act)];
  const bossUnlocked = act.missionIds.every((id) => missionDone(save, id));
  const reviews = reviewItemsToday();
  const rank = rankFor(completedActNumbers(save.acts));

  return (
    <>
      <ActTabs current={act.act} />
      <header className="play-panel__header">
        <h2>
          Act {act.act} · {act.title}
        </h2>
      </header>
      <p className="play-panel__muted">
        {rank} · {save.profile.xp} XP{actProgress?.completedAt ? ' · Act complete' : ''}
      </p>
      <ol className="act-menu">
        <li>
          <span>
            Placement test
            <small>
              {actProgress?.placement.testedOut
                ? 'Tested out'
                : actProgress?.placement.bestPercent != null
                  ? `Best ${String(actProgress.placement.bestPercent)}% · 85% tests out`
                  : act.placementTest.pitch}
            </small>
          </span>
          <button
            type="button"
            className="play-button"
            onClick={() => {
              startPlacement(act.act);
            }}
          >
            Take
          </button>
        </li>
        {act.missionIds.map((id, index) => {
          const mission = missions.find((entry) => entry.id === id);
          if (mission === undefined) return null;
          const status = save.missions[id]?.status ?? 'available';
          return (
            <li key={id}>
              <span>
                {act.act}.{index + 1} {mission.title}
                <small>{STATUS[status]}</small>
              </span>
              <button
                type="button"
                className={
                  status === 'available' ? 'play-button play-button--primary' : 'play-button'
                }
                onClick={() => {
                  startMission(id);
                }}
              >
                {status === 'completed' || status === 'tested-out' ? 'Replay' : 'Play'}
              </button>
            </li>
          );
        })}
        <li>
          <span>
            Boss: {act.boss.title}
            <small>
              {actProgress?.bossCompletedAt
                ? 'Beaten'
                : bossUnlocked
                  ? 'Dex is waiting'
                  : 'Opens after every mission (or the placement test)'}
            </small>
          </span>
          <button
            type="button"
            className="play-button"
            disabled={!bossUnlocked}
            onClick={() => {
              startBossFight(act.act);
            }}
          >
            Fight
          </button>
        </li>
        <li>
          <span>
            Field Mission: {act.fieldMission.title}
            <small>
              {actProgress?.fieldMissionCompletedAt
                ? 'Verified'
                : `Real work on your ${act.fieldMission.repoName} repo`}
            </small>
          </span>
          <button
            type="button"
            className="play-button"
            onClick={() => {
              startFieldMission(act.act);
            }}
          >
            Open
          </button>
        </li>
        {reviews > 0 ? (
          <li>
            <span>
              Standup Board
              <small>
                {reviews} {reviews === 1 ? 'review' : 'reviews'} due today
              </small>
            </span>
            <button
              type="button"
              className="play-button"
              onClick={() => {
                startReview();
              }}
            >
              Review
            </button>
          </li>
        ) : null}
      </ol>
    </>
  );
}
