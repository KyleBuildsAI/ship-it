import { useEffect } from 'react';
import { progress } from '../game/progress';
import { useStore } from './useStore';

/**
 * Applies display settings that CSS can handle on the spot: text size scales the HUD
 * panels, and reduced motion "on" stops CSS animation even when Windows allows it.
 */
export function useSettingsEffects(): void {
  const { save } = useStore(progress);
  const textSize = save?.settings.textSize ?? 'normal';
  const reducedMotion = save?.settings.reducedMotion ?? 'system';
  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    document.documentElement.dataset.reducedMotion = reducedMotion;
  }, [textSize, reducedMotion]);
}
