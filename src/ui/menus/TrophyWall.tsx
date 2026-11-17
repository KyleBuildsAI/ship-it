import { lockedRunActive, play } from '../../game/play/playStore';
import { progress } from '../../game/progress';
import { averageSeconds, drillAccuracy, practiceDayCount } from '../../game/progression/stats';
import { completedActNumbers, nextRank, rankFor } from '../../game/progression/xp';
import { useStore } from '../useStore';
import { LockedRunNote } from './LockedRunNote';
import { Overlay } from './Overlay';
import { SkillTree } from './SkillTree';

function percent(value: number | null): string {
  return value === null ? '—' : `${String(Math.round(value * 100))}%`;
}

/**
 * Rank, XP, stats and the skill tree (DESIGN.md section 6). Days are counted, never
 * streaks. It reads summaries only, so opening it never waits for an Act to download.
 */
export function TrophyWall() {
  const { save } = useStore(progress);
  const { activity } = useStore(play);
  if (save === null) return null;
  if (lockedRunActive(activity)) {
    return (
      <Overlay title="Trophy Wall">
        <LockedRunNote />
      </Overlay>
    );
  }
  const acts = completedActNumbers(save.acts);
  const next = nextRank(acts);
  const average = averageSeconds(save.drillHistory);

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
      <SkillTree save={save} />
      <p className="play-panel__muted">
        Acts complete: {acts.length === 0 ? 'none yet' : acts.map(String).join(', ')}
      </p>
    </Overlay>
  );
}
