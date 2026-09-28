import { openActMenu } from '../../game/hud';
import type { Act, Boss, FieldMission, PlacementTest } from '../../game/missions/schema';
import { startBossFight } from '../../game/play/bossPlay';
import { getAct, getCatalog, hasWorkLeft } from '../../game/play/catalog';
import { startFieldMission } from '../../game/play/fieldPlay';
import { startMission } from '../../game/play/missionPlay';
import { missionDone } from '../../game/play/saveRules';
import { reviewItemsToday, startPlacement, startReview } from '../../game/play/seriesPlay';
import { progress } from '../../game/progress';
import { completedActNumbers, rankFor } from '../../game/progression/xp';
import type { ActProgress, MissionStatus, SaveData } from '../../game/save/schema';
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

/** What each part's row needs: which Act it starts, and that Act's saved progress. */
interface PartRowProps {
  readonly actNumber: number;
  readonly actProgress: ActProgress | undefined;
}

function PlacementRow({ actNumber, actProgress, test }: PartRowProps & { test: PlacementTest }) {
  return (
    <li>
      <span>
        Placement test
        <small>
          {actProgress?.placement.testedOut
            ? 'Tested out'
            : actProgress?.placement.bestPercent != null
              ? `Best ${String(actProgress.placement.bestPercent)}% · 85% tests out`
              : test.pitch}
        </small>
      </span>
      <button
        type="button"
        className="play-button"
        onClick={() => {
          startPlacement(actNumber);
        }}
      >
        Take
      </button>
    </li>
  );
}

function BossRow({
  actNumber,
  actProgress,
  boss,
  unlocked,
  hasPlacement,
}: PartRowProps & { boss: Boss; unlocked: boolean; hasPlacement: boolean }) {
  // An early-access Act has no placement test, so testing out can't open its boss.
  const locked = hasPlacement
    ? 'Opens after every mission (or the placement test)'
    : 'Opens after every mission';
  return (
    <li>
      <span>
        Boss: {boss.title}
        <small>
          {actProgress?.bossCompletedAt ? 'Beaten' : unlocked ? 'Dex is waiting' : locked}
        </small>
      </span>
      <button
        type="button"
        className="play-button"
        disabled={!unlocked}
        onClick={() => {
          startBossFight(actNumber);
        }}
      >
        Fight
      </button>
    </li>
  );
}

function FieldRow({ actNumber, actProgress, field }: PartRowProps & { field: FieldMission }) {
  return (
    <li>
      <span>
        Field Mission: {field.title}
        <small>
          {actProgress?.fieldMissionCompletedAt
            ? 'Verified'
            : `Real work on your ${field.repoName} repo`}
        </small>
      </span>
      <button
        type="button"
        className="play-button"
        onClick={() => {
          startFieldMission(actNumber);
        }}
      >
        Open
      </button>
    </li>
  );
}

/** An early-access Act's missions still being built, numbered after the ones that shipped. */
function UpcomingRows({ act }: { act: Act }) {
  return act.upcoming.map((title, index) => {
    const number = act.missionIds.length + index + 1;
    return (
      <li key={number} className="act-menu__upcoming">
        <span>
          {act.act}.{number} {title}
          <small>Coming soon</small>
        </span>
      </li>
    );
  });
}

/** Says the Act is unfinished on purpose, and when the player has caught up with it. */
function EarlyAccessNote({ act, save }: { act: Act; save: SaveData }) {
  return (
    <p className="play-panel__muted">
      Early access ·{' '}
      {hasWorkLeft(save, act)
        ? 'More missions are on the way.'
        : "You've played everything built so far. More is on the way."}
    </p>
  );
}

/**
 * An Act's menu: placement test, the missions, the boss, the Field Mission, and reviews.
 * An early-access Act shows only the parts built so far, then its upcoming missions.
 */
export function ActMenu({ act: number }: { act: number }) {
  const { save } = useStore(progress);
  if (save === null) return null;
  const { act, missions } = getAct(number);
  const { placementTest, boss, fieldMission } = act;
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
      {act.earlyAccess ? <EarlyAccessNote act={act} save={save} /> : null}
      <ol className="act-menu">
        {placementTest ? (
          <PlacementRow actNumber={act.act} actProgress={actProgress} test={placementTest} />
        ) : null}
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
        <UpcomingRows act={act} />
        {boss ? (
          <BossRow
            actNumber={act.act}
            actProgress={actProgress}
            boss={boss}
            unlocked={bossUnlocked}
            hasPlacement={placementTest !== undefined}
          />
        ) : null}
        {fieldMission ? (
          <FieldRow actNumber={act.act} actProgress={actProgress} field={fieldMission} />
        ) : null}
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
