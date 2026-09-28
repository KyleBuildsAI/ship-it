import type { Act, Drill, Mission } from '../missions/schema';
import type { SaveData } from '../save/schema';

/** One Act's content: its definition and its missions. */
export interface ActContent {
  readonly act: Act;
  readonly missions: readonly Mission[];
}

/** The content the game plays: every shipped Act, in the order they're played. */
export interface Catalog {
  readonly acts: readonly ActContent[];
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

/** The Act numbered `number`. */
export function getAct(number: number): ActContent {
  const content = getCatalog().acts.find((entry) => entry.act.act === number);
  if (content === undefined) throw new Error(`The game has no Act ${String(number)}.`);
  return content;
}

/** Every mission of every Act. */
export function allMissions(): readonly Mission[] {
  return getCatalog().acts.flatMap((entry) => entry.missions);
}

export function findMission(id: string): Mission {
  const mission = allMissions().find((entry) => entry.id === id);
  if (mission === undefined) throw new Error(`No mission has the id "${id}".`);
  return mission;
}

/** Drills live inside missions; placement tests and reviews refer to them by id. */
export function findDrill(id: string): Drill {
  for (const mission of allMissions()) {
    const drill = mission.drills.find((entry) => entry.id === id);
    if (drill !== undefined) return drill;
  }
  throw new Error(`No drill has the id "${id}".`);
}

/**
 * The Act to offer first: the earliest one not yet complete, or the first Act once every
 * one is done. The HUD's Acts menu opens on it.
 */
export function recommendedAct(save: SaveData | null): number {
  const { acts } = getCatalog();
  const first = acts[0];
  if (first === undefined) throw new Error('The catalog has no Acts.');
  const unfinished = acts.find((entry) => !save?.acts[String(entry.act.act)]?.completedAt);
  return (unfinished ?? first).act.act;
}
