import { getCatalog } from '../../game/play/catalog';
import { progress } from '../../game/progress';
import { averageSeconds, drillAccuracy, practiceDayCount } from '../../game/progression/stats';
import { completedActNumbers, nextRank, rankFor } from '../../game/progression/xp';
import { useStore } from '../useStore';
import { Overlay } from './Overlay';

function percent(value: number | null): string {
  return value === null ? '—' : `${String(Math.round(value * 100))}%`;
}

/** Rank, XP, and stats (DESIGN.md section 6). Days are counted, never streaks. */
export function TrophyWall() {
  const { save } = useStore(progress);
  if (save === null) return null;
  const acts = completedActNumbers(save.acts);
  const next = nextRank(acts);
  const average = averageSeconds(save.drillHistory);
  const { missions } = getCatalog();
  const finished = missions.filter((mission) => {
    const status = save.missions[mission.id]?.status;
    return status === 'completed' || status === 'tested-out';
  });

  return (
    <Overlay title="Trophy Wall">
      <p className="trophy-rank">
        {rankFor(acts)} <span>{save.profile.xp} XP</span>
      </p>
      <p className="play-panel__muted">
        {next ? `Complete Act ${String(next.unlockedByAct)} to reach ${next.rank}.` : 'Top rank.'}
      </p>
      <dl className="trophy-stats">
        <div>
          <dt>Drill accuracy</dt>
          <dd>{percent(drillAccuracy(save.drillHistory))}</dd>
        </div>
        <div>
          <dt>Last 10 drills</dt>
          <dd>{percent(drillAccuracy(save.drillHistory, 10))}</dd>
        </div>
        <div>
          <dt>Average drill time</dt>
          <dd>{average === null ? '—' : `${average.toFixed(0)}s`}</dd>
        </div>
        <div>
          <dt>Days practiced</dt>
          <dd>{practiceDayCount(save.profile)}</dd>
        </div>
      </dl>
      <p className="play-panel__eyebrow">Missions</p>
      <ul className="trophy-missions">
        {missions.map((mission) => (
          <li key={mission.id} className={finished.includes(mission) ? 'checklist__done' : ''}>
            {finished.includes(mission) ? '✓' : '○'} {mission.title}
          </li>
        ))}
      </ul>
      <p className="play-panel__muted">
        Acts complete: {acts.length === 0 ? 'none yet' : acts.map(String).join(', ')}
      </p>
    </Overlay>
  );
}
