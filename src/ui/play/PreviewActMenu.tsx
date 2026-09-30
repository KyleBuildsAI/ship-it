import { LAPTOP_NOTICE, LAPTOP_SANDBOX } from '../../content/act1/laptop';
import type { RoadmapAct, Tryout } from '../../game/missions/roadmapSchema';
import { startFreePlay } from '../../game/play/freePlay';
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

/** Something that already works in an Act with no missions yet, with a button to try it. */
function TryoutRow({ tryout }: { tryout: Tryout }) {
  switch (tryout) {
    case 'laptop-sandbox':
      return (
        <li>
          <span>
            Laptop sandbox
            <small>Type PowerShell on the Windows laptop Act 1 runs on. Nothing is graded.</small>
          </span>
          <button
            type="button"
            className="play-button play-button--primary"
            onClick={() => {
              startFreePlay(LAPTOP_SANDBOX, LAPTOP_NOTICE);
            }}
          >
            Open
          </button>
        </li>
      );
  }
}

/**
 * The menu for an Act the game doesn't ship yet, read from the roadmap: where it stands,
 * its topics, anything that can already be tried, and every part DESIGN.md plans for it,
 * each marked not built.
 */
export function PreviewActMenu({ entry }: { entry: RoadmapAct }) {
  const { act, title, stage, status, topics, missions, boss, fieldMission, tryouts } = entry;
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
        {tryouts.map((tryout) => (
          <TryoutRow key={tryout} tryout={tryout} />
        ))}
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
