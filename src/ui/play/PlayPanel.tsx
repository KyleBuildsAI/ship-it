import { useLayoutEffect, useRef } from 'react';
import { hud } from '../../game/hud';
import { play } from '../../game/play/playStore';
import { progress } from '../../game/progress';
import { actForZone } from '../../game/world/zones';
import { worldState } from '../../game/worldState';
import { useStore } from '../useStore';
import { ActMenu } from './ActMenu';
import { BossView } from './BossView';
import { FieldView } from './FieldView';
import { LessonView } from './LessonView';
import { MissionView } from './MissionView';
import { SeriesView } from './SeriesView';
import { useOttoFrames } from './useOttoFrames';

/**
 * The play panel on the left: an Act's menu (the one opened from the HUD, or the island's
 * own Act while you stand on it), or whatever is being played. It sits above the terminal,
 * which is where the real work happens.
 */
export function PlayPanel() {
  const { activity, checklist } = useStore(play);
  const { zone } = useStore(worldState);
  const { terminalOpen, actMenu } = useStore(hud);
  const menuAct = actMenu ?? actForZone(zone);
  const { status, problem } = useStore(progress);
  const panel = useRef<HTMLElement>(null);
  // Only missions and drill series have Otto in them: a directed step or a drill's scene.
  const kind = activity?.kind;
  useOttoFrames(kind === 'mission' || kind === 'placement' || kind === 'review');

  let content = null;
  if (status === 'failed') {
    content = <p className="play-panel__instruction">{problem}</p>;
  } else if (status === 'loading') {
    content = null;
  } else if (activity?.kind === 'mission') {
    content = <MissionView activity={activity} checklist={checklist} />;
  } else if (activity?.kind === 'placement' || activity?.kind === 'review') {
    content = <SeriesView activity={activity} checklist={checklist} />;
  } else if (activity?.kind === 'boss') {
    content = <BossView activity={activity} checklist={checklist} />;
  } else if (activity?.kind === 'field') {
    content = <FieldView activity={activity} />;
  } else if (activity?.kind === 'lesson') {
    content = <LessonView activity={activity} />;
  } else if (menuAct !== null) {
    content = <ActMenu act={menuAct} />;
  }
  const visible = content !== null;

  // Tell the 3D view how much of its left edge the panel covers, so the camera frames the
  // scene in the space that is left. Zero again once the panel goes away.
  useLayoutEffect(() => {
    const element = panel.current;
    if (!visible || !element) return;
    const report = () => {
      worldState.update({ leftInset: element.getBoundingClientRect().right });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => {
      observer.disconnect();
      worldState.update({ leftInset: 0 });
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <section
      ref={panel}
      className={terminalOpen ? 'glass play-panel play-panel--above-terminal' : 'glass play-panel'}
      aria-label="Missions"
    >
      {content}
    </section>
  );
}
