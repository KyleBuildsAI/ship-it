import { useLayoutEffect, useRef } from 'react';
import { hud } from '../../game/hud';
import { play } from '../../game/play/playStore';
import { progress } from '../../game/progress';
import { worldState } from '../../game/worldState';
import { useStore } from '../useStore';
import { ActMenu } from './ActMenu';
import { BossView } from './BossView';
import { FieldView } from './FieldView';
import { MissionView } from './MissionView';
import { SeriesView } from './SeriesView';

/**
 * The play panel on the left: the Act menu while exploring the Git World, or whatever is
 * being played. It sits above the terminal, which is where the real work happens.
 */
export function PlayPanel() {
  const { activity, checklist } = useStore(play);
  const { zone } = useStore(worldState);
  const { terminalOpen, actMenuOpen } = useStore(hud);
  const { status, problem } = useStore(progress);
  const panel = useRef<HTMLElement>(null);

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
    content = <FieldView />;
  } else if (zone === 'gitworld' || actMenuOpen) {
    content = <ActMenu />;
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
