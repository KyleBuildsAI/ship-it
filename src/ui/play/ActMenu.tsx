import { useEffect } from 'react';
import { roadmapAct } from '../../content/roadmap';
import type { PlacementTest } from '../../game/missions/schema';
import type {
  ActOutline,
  BossOutline,
  FieldMissionOutline,
  PartSummary,
} from '../../game/play/actSummary';
import { findActSummary, hasWorkLeft, prefetchAct, type FreePlay } from '../../game/play/catalog';
import { starsFor } from '../../game/missions/lessonRunner';
import { startFreePlay } from '../../game/play/freePlay';
import { partResumeFor, resumeCardNumber } from '../../game/play/lessonResume';
import { cancelPendingPlay, type PlayRequest } from '../../game/play/playWhenReady';
import { reviewItemsToday } from '../../game/play/seriesPlay';
import { bossAccess, isUnlocked, type BossAccess } from '../../game/play/unlock';
import { progress } from '../../game/progress';
import { completedActNumbers, rankFor } from '../../game/progression/xp';
import type { ActProgress, MissionProgress, MissionStatus, SaveData } from '../../game/save/schema';
import { useStore } from '../useStore';
import { ActTabs } from './ActTabs';
import { LoadFailedAlert, PlayButton } from './PlayButton';
import { PreviewActMenu } from './PreviewActMenu';

const STATUS: Record<MissionStatus, string> = {
  available: '',
  'in-progress': 'In progress',
  completed: 'Done',
  'tested-out': 'Tested out',
};

/**
 * What a lesson's row says under its title: its stars once done (the save keeps the best
 * first-try percent in bestDrillScore), and for a final, that it's timed. It says "In
 * progress" only when Play will pick the lesson up partway. A timed final, or a lesson left
 * before its first answer, starts again at the briefing, so its row shows only its kind.
 */
function lessonNote(lesson: PartSummary, saved: MissionProgress | undefined): string {
  const status = saved?.status ?? 'available';
  if (status === 'completed') {
    const stars = starsFor(saved?.bestDrillScore ?? 0);
    return `Done · ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  }
  const cards = lesson.cardIds.length;
  const kind = lesson.kind === 'final' ? 'Timed final challenge' : `${String(cards)} cards`;
  if (status === 'tested-out') return `${STATUS[status]} · ${kind}`;
  const resume = partResumeFor(lesson, saved);
  if (resume === null) return kind;
  const card = resumeCardNumber(cards, resume);
  return `${STATUS['in-progress']} · card ${String(card)} of ${String(cards)}`;
}

/**
 * The status a lesson's row is drawn with. A lesson started but left with nothing to pick
 * up starts again at its briefing, so its Play looks like a fresh start's, matching a note
 * that no longer says "In progress".
 */
function lessonRowStatus(lesson: PartSummary, saved: MissionProgress | undefined): MissionStatus {
  const status = saved?.status ?? 'available';
  if (status !== 'in-progress') return status;
  return partResumeFor(lesson, saved) === null ? 'available' : status;
}

/** A row that starts a mission or a lesson: Play the first time, Replay once it's done. */
function PlayRow({
  label,
  note,
  status,
  request,
}: {
  label: string;
  note: string;
  status: MissionStatus;
  request: PlayRequest;
}) {
  return (
    <li>
      <span>
        {label}
        <small>{note}</small>
      </span>
      <PlayButton
        request={request}
        className={status === 'available' ? 'play-button play-button--primary' : 'play-button'}
      >
        {status === 'completed' || status === 'tested-out' ? 'Replay' : 'Play'}
      </PlayButton>
    </li>
  );
}

/** An Act's free-play sandbox: open it and try things, with nothing graded. */
function FreePlayRow({ actNumber, steps, notice }: FreePlay & { actNumber: number }) {
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
          startFreePlay(actNumber, steps, notice);
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
      <PlayButton request={{ kind: 'placement', act: actNumber }}>Take</PlayButton>
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
}: PartRowProps & { boss: BossOutline; access: BossAccess; hasPlacement: boolean }) {
  return (
    <li>
      <span>
        Boss: {boss.title}
        <small>{actProgress?.bossCompletedAt ? 'Beaten' : bossHint(access, hasPlacement)}</small>
      </span>
      <PlayButton request={{ kind: 'boss', act: actNumber }} disabled={access === 'locked'}>
        Fight
      </PlayButton>
    </li>
  );
}

function FieldRow({
  actNumber,
  actProgress,
  field,
}: PartRowProps & { field: FieldMissionOutline }) {
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
      <PlayButton request={{ kind: 'field', act: actNumber }}>Open</PlayButton>
    </li>
  );
}

/** An early-access Act's missions still being built, numbered after the ones that shipped. */
function UpcomingRows({ act }: { act: ActOutline }) {
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
function EarlyAccessNote({ act, save }: { act: ActOutline; save: SaveData }) {
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
 * preview mode, an Act the game doesn't ship yet shows its roadmap entry instead. It reads
 * only the Act's summary, so it draws at once, before the Act's content has downloaded.
 */
export function ActMenu({ act: number }: { act: number }) {
  const { save } = useStore(progress);
  // Above the early return: React needs the same hooks, in the same order, every render.
  useEffect(() => {
    // Opening the menu starts its Act's download, so Play is nearly always instant.
    prefetchAct(number);
    // Closing the menu, or switching Act, drops a press still waiting for its download, so
    // play never starts behind the player's back.
    return cancelPendingPlay;
  }, [number]);
  if (save === null) return null;
  const summary = findActSummary(number);
  if (summary === undefined) {
    // Only preview mode has tabs for these Acts. Without it there's nothing to show, and
    // nothing to crash on either.
    const planned = isUnlocked(save) ? roadmapAct(number) : undefined;
    return planned ? <PreviewActMenu entry={planned} /> : null;
  }
  const { act, parts, freePlay } = summary;
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
      <LoadFailedAlert />
      <ol className="act-menu">
        {placementTest ? (
          <PlacementRow actNumber={act.act} actProgress={actProgress} test={placementTest} />
        ) : null}
        {act.missionIds.map((id, index) => {
          const number = `${String(act.act)}.${String(index + 1)}`;
          const saved = save.missions[id];
          const status = saved?.status ?? 'available';
          // An id with nothing built for it yet has no part, so it gets no row.
          const part = parts.find((entry) => entry.id === id);
          if (part === undefined) return null;
          if (part.kind === 'mission') {
            return (
              <PlayRow
                key={id}
                label={`${number} ${part.title}`}
                note={STATUS[status]}
                status={status}
                request={{ kind: 'mission', id }}
              />
            );
          }
          return (
            <PlayRow
              key={id}
              label={`${number} ${part.kind === 'final' ? 'Final: ' : ''}${part.title}`}
              note={lessonNote(part, saved)}
              status={lessonRowStatus(part, saved)}
              request={{ kind: 'lesson', id }}
            />
          );
        })}
        <UpcomingRows act={act} />
        {freePlay ? <FreePlayRow actNumber={act.act} {...freePlay} /> : null}
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
            <PlayButton request={{ kind: 'review' }}>Review</PlayButton>
          </li>
        ) : null}
      </ol>
    </>
  );
}
