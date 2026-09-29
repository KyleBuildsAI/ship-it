import type { RoadmapAct } from '../../game/missions/roadmapSchema';
import { ActTabs } from './ActTabs';

/** What a part that doesn't exist yet says, in place of a button. */
const NOT_BUILT = 'Not built yet';

/** A mission, boss or Field Mission that is only planned: dimmed, with no button. */
function PlannedRow({ label }: { label: string }) {
  return (
    <li className="act-menu__upcoming">
      <span>
        {label}
        <small>{NOT_BUILT}</small>
      </span>
    </li>
  );
}

/**
 * Preview mode's menu for an Act the game doesn't ship yet, read from the roadmap: where
 * it stands, its topics, and every part DESIGN.md plans for it, each marked not built.
 * Nothing here starts a mission, because there is none to start.
 */
export function PreviewActMenu({ entry }: { entry: RoadmapAct }) {
  const { act, title, stage, status, topics, missions, boss, fieldMission } = entry;
  return (
    <>
      <ActTabs current={act} />
      <header className="play-panel__header">
        <h2>
          Act {act} · {title}
          {stage === 'preview' ? ' (preview)' : ''}
        </h2>
      </header>
      <p className="play-panel__muted">{status}</p>
      <p className="play-panel__instruction">{topics}</p>
      <ol className="act-menu">
        {missions.map((mission, index) => (
          <PlannedRow
            key={mission.title}
            label={`${String(act)}.${String(index + 1)} ${mission.title}`}
          />
        ))}
        <PlannedRow label={`Boss: ${boss.title}`} />
        {fieldMission ? <PlannedRow label={`Field Mission: ${fieldMission.title}`} /> : null}
      </ol>
    </>
  );
}
