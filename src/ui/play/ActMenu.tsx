import { roadmapAct } from '../../content/roadmap';
import type { Act, Boss, FieldMission, PlacementTest } from '../../game/missions/schema';
import { startBossFight } from '../../game/play/bossPlay';
import { findAct, hasWorkLeft, type ActContent } from '../../game/play/catalog';
import { startFieldMission } from '../../game/play/fieldPlay';
import { startFreePlay } from '../../game/play/freePlay';
import { startMission } from '../../game/play/missionPlay';
import { reviewItemsToday, startPlacement, startReview } from '../../game/play/seriesPlay';
import { bossAccess, isUnlocked, type BossAccess } from '../../game/play/unlock';
import { progress } from '../../game/progress';
import { completedActNumbers, rankFor } from '../../game/progression/xp';
import type { ActProgress, MissionStatus, SaveData } from '../../game/save/schema';
import { useStore } from '../useStore';
import { ActTabs } from './ActTabs';
import { PreviewActMenu } from './PreviewActMenu';

const STATUS: Record<MissionStatus, string> = {
  available: '',
  'in-progress': 'In progress',
  completed: 'Done',
  'tested-out': 'Tested out',
};

/** An Act's free-play sandbox: open it and try things, with nothing graded. */
function FreePlayRow({ steps, notice }: NonNullable<ActContent['freePlay']>) {
  return (
    <li>
      <span>
        Laptop sandbox
        <small>Try anything on the laptop. Nothing is graded.</small>
      </span>
      <button
        type="button"
        className="play-button"
        onClick={() => {
          startFreePlay(steps, notice);
        }}
      >
        Open
      </button>
    </li>
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

/** What the boss row says under its title, for each way the boss can be open or not. */
function bossHint(access: BossAccess, hasPlacement: boolean): string {
  switch (access) {
    case 'earned':
      return 'Dex is waiting';
    case 'preview':
      return 'Unlocked for preview';
    case 'locked':
      // An early-access Act has no placement test, so testing out can't open its boss.
      return hasPlacement
        ? 'Opens after every mission (or the placement test)'
        : 'Opens after every mission';
  }
}

function BossRow({
  actNumber,
  actProgress,
  boss,
  access,
  hasPlacement,
}: PartRowProps & { boss: Boss; access: BossAccess; hasPlacement: boolean }) {
  return (
    <li>
      <span>
        Boss: {boss.title}
        <small>{actProgress?.bossCompletedAt ? 'Beaten' : bossHint(access, hasPlacement)}</small>
      </span>
      <button
        type="button"
        className="play-button"
        disabled={access === 'locked'}
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
  // Promise missions only while some are listed. With none left, what's coming is a part
  // not built yet, like the boss, so the line stays general.
  const coming = act.upcoming.length > 0 ? 'More missions are on the way.' : 'More is on the way.';
  return (
    <p className="play-panel__muted">
      Early access ·{' '}
      {hasWorkLeft(save, act) ? coming : `You've played everything built so far. ${coming}`}
    </p>
  );
}

/**
 * An Act's menu: placement test, the missions, the boss, the Field Mission, and reviews.
 * An early-access Act shows only the parts built so far, then its upcoming missions. In
 * preview mode, an Act the game doesn't ship yet shows its roadmap entry instead.
 */
export function ActMenu({ act: number }: { act: number }) {
  const { save } = useStore(progress);
  if (save === null) return null;
  const content = findAct(number);
  if (content === undefined) {
    // Only preview mode has tabs for these Acts. Without it there's nothing to show, and
    // nothing to crash on either.
    const planned = isUnlocked(save) ? roadmapAct(number) : undefined;
    return planned ? <PreviewActMenu entry={planned} /> : null;
  }
  const { act, missions } = content;
  const { placementTest, boss, fieldMission } = act;
  const actProgress = save.acts[String(act.act)];
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
        {content.freePlay ? <FreePlayRow {...content.freePlay} /> : null}
        {boss ? (
          <BossRow
            actNumber={act.act}
            actProgress={actProgress}
            boss={boss}
            access={bossAccess(save, act)}
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
