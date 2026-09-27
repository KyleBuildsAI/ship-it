import type { Act, Drill, Mission } from '../missions/schema';

/** The content the game plays: one Act and its missions (Act 2 in Milestone 1). */
export interface Catalog {
  readonly act: Act;
  readonly missions: readonly Mission[];
}

let current: Catalog | null = null;

/** Set once at startup from src/content. Tests set a sample catalog instead. */
export function setCatalog(catalog: Catalog): void {
  current = catalog;
}

export function getCatalog(): Catalog {
  if (current === null) throw new Error('No content catalog is loaded; call setCatalog first.');
  return current;
}

export function findMission(id: string): Mission {
  const mission = getCatalog().missions.find((entry) => entry.id === id);
  if (mission === undefined) throw new Error(`No mission has the id "${id}".`);
  return mission;
}

/** Drills live inside missions; placement tests and reviews refer to them by id. */
export function findDrill(id: string): Drill {
  for (const mission of getCatalog().missions) {
    const drill = mission.drills.find((entry) => entry.id === id);
    if (drill !== undefined) return drill;
  }
  throw new Error(`No drill has the id "${id}".`);
}
