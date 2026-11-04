import type { Lesson } from '../missions/lessonSchema';
import { ContentError, type Act, type Drill, type Mission } from '../missions/schema';
import type { SaveData } from '../save/schema';
import { summarizeAct, type ActOutline, type ActSummary, type FreePlay } from './actSummary';
import { missionDone } from './saveRules';

export type { FreePlay } from './actSummary';

/**
 * One Act's content: its definition, its missions, and its lessons. The Act's missionIds
 * name both, in play order: an Act the game simulates has missions, an Act it teaches by
 * situations and choices has lessons, and an Act could mix them.
 */
export interface ActContent {
  readonly act: Act;
  readonly missions: readonly Mission[];
  readonly lessons?: readonly Lesson[];
  readonly freePlay?: FreePlay;
}

/** Every shipped Act's content, in the order they're played. */
export interface Catalog {
  readonly acts: readonly ActContent[];
}

/**
 * One Act as the game ships it: its summary, which menus read straight away, and a way to
 * fetch its content, which only play needs. The game's first download can then carry the
 * summaries and leave each Act's content in a file of its own.
 */
export interface LazyAct {
  readonly summary: ActSummary;
  readonly load: () => Promise<ActContent>;
}

/** Thrown when code reads an Act's content before anything loaded it. */
export class ActNotLoadedError extends Error {
  // Set in the constructor, not as a parameter property: erasableSyntaxOnly forbids those.
  readonly act: number;

  constructor(act: number) {
    super(
      `Act ${String(act)} isn't loaded. Start play through playWhenReady ` +
        '(src/game/play/playWhenReady.ts).',
    );
    this.name = 'ActNotLoadedError';
    this.act = act;
  }
}

interface CatalogState {
  readonly entries: readonly LazyAct[];
  /** Acts whose content has arrived. Nothing is ever dropped: play may be reading it. */
  readonly loaded: Map<number, ActContent>;
  /** Downloads in flight, so everyone who asks for the same Act shares one. */
  readonly loading: Map<number, Promise<ActContent>>;
}

let state: CatalogState | null = null;

function currentState(): CatalogState {
  if (state === null) {
    throw new Error('No content catalog is loaded; call setCatalog or setLazyCatalog first.');
  }
  return state;
}

/**
 * Set at startup from src/content, and by tests. All of the content is here, so every Act
 * counts as loaded. The game moves to setLazyCatalog once play goes through the loader.
 */
export function setCatalog(catalog: Catalog): void {
  const entries = catalog.acts.map((content) => ({
    summary: {
      ...summarizeAct(content),
      ...(content.freePlay === undefined ? {} : { freePlay: content.freePlay }),
    },
    // Never called: every Act goes into `loaded` below and is never dropped, so loadAct
    // returns it before it looks for a loader. A LazyAct just has to have one.
    load: () => Promise.resolve(content),
  }));
  const loaded = new Map(catalog.acts.map((content) => [content.act.act, content]));
  state = { entries, loaded, loading: new Map() };
}

/**
 * Summaries now, each Act's content when play needs it. Nothing calls this yet: main.tsx
 * switches to it once each Act's content is split into a file of its own.
 */
export function setLazyCatalog(acts: readonly LazyAct[]): void {
  state = { entries: acts, loaded: new Map(), loading: new Map() };
}

/** Every shipped Act's summary, in play order. Never downloads anything. */
export function actSummaries(): readonly ActSummary[] {
  return currentState().entries.map((entry) => entry.summary);
}

/**
 * Act `act`'s summary, or undefined when the game doesn't ship it yet. Preview mode shows
 * tabs for Acts that are only planned, so the menu asks before it reads one.
 */
export function findActSummary(act: number): ActSummary | undefined {
  return actSummaries().find((summary) => summary.act.act === act);
}

/** The Act a mission or lesson belongs to, so play knows which Act to load first. */
export function actOfPart(id: string): number | undefined {
  const owner = actSummaries().find(({ parts }) => parts.some((part) => part.id === id));
  return owner?.act.act;
}

/** The Act a drill comes from. A review can draw drills from more than one Act. */
export function actOfDrill(id: string): number | undefined {
  const owner = actSummaries().find(({ drills }) => drills.some((drill) => drill.id === id));
  return owner?.act.act;
}

/** Every drill id this build ships. A save can still name a drill a later build removed. */
export function knownDrillIds(): ReadonlySet<string> {
  return new Set(actSummaries().flatMap(({ drills }) => drills.map((drill) => drill.id)));
}

/** What a drill asks, for lists like the Standup Board, or undefined for an unknown id. */
export function drillPrompt(id: string): string | undefined {
  for (const { drills } of actSummaries()) {
    const drill = drills.find((entry) => entry.id === id);
    if (drill !== undefined) return drill.prompt;
  }
  return undefined;
}

export function isActLoaded(act: number): boolean {
  return currentState().loaded.has(act);
}

/**
 * Act `act`'s content, downloading it the first time. Callers share a download in flight.
 * A failed one is forgotten, so the next call tries again. The failure is logged here, once
 * per download however many callers share it, so a caller only has to tell the player.
 */
export function loadAct(act: number): Promise<ActContent> {
  // Held for the whole download: if a new catalog replaces this one meanwhile, the content
  // lands in the old catalog's maps and the new one never sees it.
  const stateAtStart = currentState();
  const done = stateAtStart.loaded.get(act);
  if (done !== undefined) return Promise.resolve(done);
  const inFlight = stateAtStart.loading.get(act);
  if (inFlight !== undefined) return inFlight;
  const download = fetchContent(stateAtStart.entries, act)
    .then((content) => {
      stateAtStart.loaded.set(act, content);
      return content;
    })
    // .then and .finally always run later, never during this call, so this delete can't
    // come before the loading.set below, even when the loader fails straight away.
    .finally(() => stateAtStart.loading.delete(act));
  // A side branch, not part of the chain callers get: they still see the failure. Being
  // attached already, it also means a caller that ignores the result leaves no unhandled
  // rejection behind.
  download.catch((error: unknown) => {
    console.error(`[ship-it] Act ${String(act)} did not load`, error);
  });
  stateAtStart.loading.set(act, download);
  return download;
}

/**
 * Finds the Act's loader, runs it, and checks it brought the Act it was asked for. Being
 * async, it turns every problem, even a loader that throws before returning a promise,
 * into a failed download like any other.
 */
async function fetchContent(entries: readonly LazyAct[], act: number): Promise<ActContent> {
  const entry = entries.find(({ summary }) => summary.act.act === act);
  if (entry === undefined) throw new Error(`The game has no Act ${String(act)}.`);
  const content = await entry.load();
  if (content.act.act !== act) {
    throw new ContentError(
      `Act ${String(act)}'s loader returned Act ${String(content.act.act)}'s content.`,
    );
  }
  return content;
}

/**
 * Starts loading an Act the player is likely to play soon, such as the one whose menu just
 * opened. Nothing waits for it: loadAct logs a failure and forgets it, so the next request
 * for that Act tries again.
 */
export function prefetchAct(act: number): void {
  // Preview mode has tabs for Acts the game doesn't ship; there's nothing to fetch for them.
  if (findActSummary(act) === undefined) return;
  void loadAct(act);
}

/*
 * Content of loaded Acts only. Everything below runs inside an activity, and play starts
 * only once its Act has loaded (the playWhenReady rule), so the content is always here.
 * Each lookup needs just the one Act that holds the id; the others may still be downloading.
 */

/** The Act numbered `act`, already loaded. */
export function loadedAct(act: number): ActContent {
  if (findActSummary(act) === undefined) throw new Error(`The game has no Act ${String(act)}.`);
  const content = currentState().loaded.get(act);
  if (content === undefined) throw new ActNotLoadedError(act);
  return content;
}

/** The mission with this id, from whichever loaded Act holds it. */
export function loadedMission(id: string): Mission {
  const mission = findInLoadedActs(id, (content) => content.missions);
  if (mission !== undefined) return mission;
  requireOwnerLoaded(actOfPart(id));
  throw new Error(`No mission has the id "${id}".`);
}

/** The lesson with this id, or undefined when the id names a mission (or nothing). */
export function loadedLesson(id: string): Lesson | undefined {
  const lesson = findInLoadedActs(id, (content) => content.lessons ?? []);
  if (lesson === undefined) requireOwnerLoaded(actOfPart(id));
  return lesson;
}

/** Drills live inside missions; placement tests and reviews refer to them by id. */
export function loadedDrill(id: string): Drill {
  const drill = findInLoadedActs(id, (content) =>
    content.missions.flatMap((mission) => mission.drills),
  );
  if (drill !== undefined) return drill;
  requireOwnerLoaded(actOfDrill(id));
  throw new Error(`No drill has the id "${id}".`);
}

/** Looks through every loaded Act. Ids are unique across Acts, so the first match is it. */
function findInLoadedActs<Item extends { readonly id: string }>(
  id: string,
  itemsOf: (content: ActContent) => readonly Item[],
): Item | undefined {
  for (const content of currentState().loaded.values()) {
    const item = itemsOf(content).find((entry) => entry.id === id);
    if (item !== undefined) return item;
  }
  return undefined;
}

/**
 * For an id no loaded Act has: when the summaries say which Act owns it, that Act just
 * hasn't loaded, which is a different bug from an id this build doesn't have at all.
 */
function requireOwnerLoaded(owner: number | undefined): void {
  if (owner !== undefined && !isActLoaded(owner)) throw new ActNotLoadedError(owner);
}

/**
 * Whether an Act still has something built for the player to do: a mission not done, or a
 * boss or Field Mission that exists and isn't finished. Parts an early-access Act hasn't
 * built yet don't count, so finishing its missions leaves nothing to do for now. It only
 * asks whether a boss or Field Mission exists, so an Act's summary is enough.
 */
export function hasWorkLeft(save: SaveData, act: ActOutline): boolean {
  const progress = save.acts[String(act.act)];
  const missionLeft = act.missionIds.some((id) => !missionDone(save, id));
  const bossLeft = act.boss !== undefined && !progress?.bossCompletedAt;
  const fieldLeft = act.fieldMission !== undefined && !progress?.fieldMissionCompletedAt;
  return missionLeft || bossLeft || fieldLeft;
}

/**
 * The Act to offer first: the earliest one not complete that still has work left, or the
 * first Act once there's none anywhere. The HUD's Acts menu opens on it. It reads summaries
 * only, so opening the HUD never waits for an Act to download.
 */
export function recommendedAct(save: SaveData | null): number {
  const acts = actSummaries();
  const first = acts[0];
  if (first === undefined) throw new Error('The catalog has no Acts.');
  if (save === null) return first.act.act;
  // Both checks matter. An early-access Act never completes, so only "work left" moves the
  // player past it once its built missions are done. A tested-out Act is complete with its
  // boss never fought, so only "complete" moves the player past that one.
  const next = acts.find(
    ({ act }) => !save.acts[String(act.act)]?.completedAt && hasWorkLeft(save, act),
  );
  return (next ?? first).act.act;
}
