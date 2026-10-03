import { z } from 'zod';
import { resolvePath } from '../../engine/fs/paths';
import type { FixtureStep } from '../../engine/git/fixtures';
import type { Predicate } from './predicates';

/**
 * The building blocks that mission content schemas share: on-screen text, ids, paths,
 * setups, predicates, and a few helpers. They live apart from schema.ts so that a schema
 * which schema.ts imports can use them without importing schema.ts back. That would be an
 * import cycle, and in a cycle one of the two files runs before the other has created its
 * exports, so its first use of, say, `ScreenTextSchema` would throw while the game loads.
 *
 * The rule in schema.ts holds here too: every object is a `strictObject`.
 */

// ---- Shared building blocks ---------------------------------------------------------

/** DESIGN.md pillar 1: never more than about 60 words on screen at once. */
export const MAX_SCREEN_WORDS = 60;

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word !== '').length;
}

/** Text the player reads on screen: non-empty and within the word budget. */
export const ScreenTextSchema = z
  .string()
  .trim()
  .min(1)
  .refine((text) => countWords(text) <= MAX_SCREEN_WORDS, {
    error: `Keep on-screen text to ${String(MAX_SCREEN_WORDS)} words or fewer (DESIGN.md pillar 1).`,
  });

export const NameSchema = z.string().trim().min(1);

/** Ids end up in save files and URLs, so they use one predictable shape: `three-rooms`. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const IdSchema = z.string().regex(KEBAB_CASE, 'Use a kebab-case id like "three-rooms".');

/**
 * A file path inside the sandbox in the engine's one canonical form: `src/app.ts`, never
 * `./src/app.ts`, `/src/app.ts`, or `src\app.ts`. A path is canonical when resolving it
 * from the project root changes nothing.
 */
export const RepoPathSchema = z
  .string()
  .min(1)
  .refine((path) => resolvePath('', path) === path, {
    error: 'Write paths from the project root with forward slashes, like "src/app.ts".',
  });

const PathListSchema = z.array(RepoPathSchema).min(1);

/**
 * A path on the laptop's drive, from C:\ in the same canonical form: 'Users/kyle/notes'.
 * A check never expands '~' or a drive letter, so '~/notes' would look for a folder
 * named '~' at C:\ and 'C:/Users' for one named 'C:'. Such a check could never pass, and
 * with `exists: false` it would always pass, so both shapes are content mistakes.
 */
const DrivePathSchema = RepoPathSchema.refine(
  (path) => path.split('/')[0] !== '~' && !path.includes(':'),
  {
    error:
      'Write the full drive path from C:\\, like "Users/kyle/notes". A check does not expand "~" or "C:".',
  },
);

// ---- Fixture steps --------------------------------------------------------------------

/** A Windows environment variable name, like PORT or ProgramFiles(x86). */
export const EnvNameSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_()]*$/, 'Use an environment variable name like "PORT".');

export const EnvScopeSchema = z.enum(['session', 'user', 'machine']);

/** Mirrors the engine's `FixtureStep` union, so mission setups are checked before replay. */
export const FixtureStepSchema = z.discriminatedUnion('op', [
  z
    .strictObject({
      op: z.literal('windows'),
      user: NameSchema,
      computer: NameSchema,
      mount: RepoPathSchema.optional(),
    })
    .readonly(),
  z.strictObject({ op: z.literal('mkdir'), path: RepoPathSchema }).readonly(),
  z.strictObject({ op: z.literal('session') }).readonly(),
  z.strictObject({ op: z.literal('cd'), path: RepoPathSchema }).readonly(),
  z
    .strictObject({
      op: z.literal('env'),
      scope: EnvScopeSchema,
      name: EnvNameSchema,
      value: z.string().nullable(),
    })
    .readonly(),
  z
    .strictObject({
      op: z.literal('pathAdd'),
      scope: EnvScopeSchema,
      dir: z.string().trim().min(1),
      at: z.enum(['start', 'end']),
    })
    .readonly(),
  z.strictObject({ op: z.literal('restartTerminals') }).readonly(),
  z.strictObject({ op: z.literal('init') }).readonly(),
  z.strictObject({ op: z.literal('write'), path: RepoPathSchema, content: z.string() }).readonly(),
  z.strictObject({ op: z.literal('append'), path: RepoPathSchema, text: z.string() }).readonly(),
  z.strictObject({ op: z.literal('delete'), path: RepoPathSchema }).readonly(),
  z.strictObject({ op: z.literal('stage'), paths: z.array(RepoPathSchema).readonly() }).readonly(),
  z.strictObject({ op: z.literal('commit'), message: NameSchema }).readonly(),
]);

/**
 * True only when A and B are the same type, readonly modifiers included. The unused-
 * looking T is the trick: TypeScript only treats these two generic function types as
 * equal when A and B are identical, which is stricter than "each fits into the other".
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- T is the trick above. */
export type SameType<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

/**
 * A compile-time proof, checked by `npm run typecheck`: if the engine adds or changes a
 * FixtureStep, this line stops compiling until the schema above is updated to match.
 */
export const FIXTURE_SCHEMA_MATCHES_ENGINE: SameType<
  z.output<typeof FixtureStepSchema>,
  FixtureStep
> = true;

const MACHINE_ONLY_OPS = new Set(['mkdir', 'session', 'cd', 'env', 'pathAdd', 'restartTerminals']);

/**
 * A whole setup. windows() may only come first, and the laptop steps (folders, terminals,
 * variables) only make sense after it, so a misplaced step fails validation instead of
 * the game.
 */
// Readonly so content can pass a builder's `.toSpec()` result straight in.
export const FixtureSchema = z
  .array(FixtureStepSchema)
  .readonly()
  .superRefine((steps, context) => {
    const onLaptop = steps[0]?.op === 'windows';
    steps.forEach((step, index) => {
      if (step.op === 'windows' && index > 0) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'windows() must be the first step.',
        });
      }
      if (!onLaptop && MACHINE_ONLY_OPS.has(step.op)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: `The "${step.op}" step needs windows() as the first step.`,
        });
      }
    });
  });

// ---- Predicates -----------------------------------------------------------------------

/**
 * `g` and `y` are left out on purpose: they make `RegExp.test()` remember where it last
 * matched, so checking the same message twice could give two different answers.
 */
const RegexFlagsSchema = z
  .string()
  .regex(/^[imsu]*$/, 'Only the i, m, s, and u flags are allowed. g and y make test() stateful.');

/** Why a pattern won't compile, or null when it's fine. */
export function regexProblem(pattern: string, flags = ''): string | null {
  try {
    new RegExp(pattern, flags);
    return null;
  } catch (error) {
    // The RegExp constructor throws a SyntaxError that names the problem; pass it on.
    return error instanceof Error ? error.message : String(error);
  }
}

/** Rejects a bad regular expression when the mission loads, not when a player is mid-drill. */
function checkRegex(
  value: { pattern: string; flags?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  const problem = regexProblem(value.pattern, value.flags);
  if (problem !== null) {
    ctx.addIssue({ code: 'custom', message: `Invalid regex: ${problem}`, path: ['pattern'] });
  }
}

const labelled = { label: ScreenTextSchema.optional() };
const regexFields = { pattern: z.string().min(1), flags: RegexFlagsSchema.optional() };
// Recursion goes through z.lazy, which waits until parse time to read PredicateSchema,
// because PredicateSchema doesn't exist yet while this list is being built.
const nested = z.lazy(() => PredicateSchema);

const predicateKinds = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('isRepo'), ...labelled }),
  z.strictObject({ kind: z.literal('clean'), ...labelled }),
  z.strictObject({
    kind: z.literal('staged'),
    paths: PathListSchema,
    exact: z.boolean().optional(),
    ...labelled,
  }),
  z.strictObject({ kind: z.literal('notStaged'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('untracked'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('tracked'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('notTracked'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('ignored'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('modified'), paths: PathListSchema, ...labelled }),
  z
    .strictObject({
      kind: z.literal('commitCount'),
      min: z.int().nonnegative().optional(),
      max: z.int().nonnegative().optional(),
      equals: z.int().nonnegative().optional(),
      ...labelled,
    })
    .superRefine((value, ctx) => {
      const { min, max, equals } = value;
      if (min === undefined && max === undefined && equals === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Give at least one of min, max, or equals.' });
      }
      if (min !== undefined && max !== undefined && min > max) {
        ctx.addIssue({ code: 'custom', message: 'min is larger than max.', path: ['min'] });
      }
      // { equals: 3, min: 5 } can never pass, and describe() would only mention equals.
      if (equals !== undefined && (min !== undefined || max !== undefined)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Use equals on its own, or min and max without it.',
          path: ['equals'],
        });
      }
    }),
  z
    .strictObject({ kind: z.literal('headMessage'), ...regexFields, ...labelled })
    .superRefine(checkRegex),
  z
    .strictObject({
      kind: z.literal('allMessagesMatch'),
      ...regexFields,
      last: z.int().positive().optional(),
      ...labelled,
    })
    .superRefine(checkRegex),
  z.strictObject({
    kind: z.literal('fileAtHead'),
    path: RepoPathSchema,
    equals: z.string().optional(),
    contains: z.string().min(1).optional(),
    ...labelled,
  }),
  z
    .strictObject({
      kind: z.literal('workingFile'),
      path: RepoPathSchema,
      equals: z.string().optional(),
      contains: z.string().min(1).optional(),
      exists: z.boolean().optional(),
      ...labelled,
    })
    .superRefine((value, ctx) => {
      // "The file must be gone, and contain X" can never pass, so it's a content bug.
      if (value.exists === false && (value.equals !== undefined || value.contains !== undefined)) {
        ctx.addIssue({
          code: 'custom',
          message: 'A file that must not exist cannot also have content to check.',
          path: ['exists'],
        });
      }
    }),
  z.strictObject({
    kind: z.literal('commitChanged'),
    ref: NameSchema.optional(),
    paths: PathListSchema,
    only: z.boolean().optional(),
    ...labelled,
  }),
  z
    .strictObject({ kind: z.literal('reflogContains'), ...regexFields, ...labelled })
    .superRefine(checkRegex),
  z.strictObject({ kind: z.literal('headMessageIs'), message: NameSchema, ...labelled }),
  z.strictObject({ kind: z.literal('all'), of: z.array(nested).min(1), ...labelled }),
  z.strictObject({ kind: z.literal('any'), of: z.array(nested).min(1), ...labelled }),
  z.strictObject({ kind: z.literal('not'), predicate: nested, ...labelled }),
  // ---- The laptop (Act 1) ----
  // Paths start at C:\ ('Users/kyle/notes'). validateAct checks the setup is a windows() laptop.
  z.strictObject({
    kind: z.literal('currentDirectory'),
    path: DrivePathSchema,
    tab: z.union([z.int().positive(), z.literal('any')]).optional(),
    ...labelled,
  }),
  z.strictObject({
    kind: z.literal('driveFolder'),
    path: DrivePathSchema,
    exists: z.boolean().optional(),
    ...labelled,
  }),
  z
    .strictObject({
      kind: z.literal('driveFile'),
      path: DrivePathSchema,
      equals: z.string().optional(),
      contains: z.string().min(1).optional(),
      pattern: z.string().min(1).optional(),
      flags: RegexFlagsSchema.optional(),
      exists: z.boolean().optional(),
      ...labelled,
    })
    .superRefine((value, ctx) => {
      if (value.pattern !== undefined)
        checkRegex({ pattern: value.pattern, flags: value.flags }, ctx);
      // Flags only change how a pattern matches; on their own they would be ignored.
      if (value.flags !== undefined && value.pattern === undefined) {
        ctx.addIssue({ code: 'custom', message: 'flags need a pattern.', path: ['flags'] });
      }
      const content = [value.equals, value.contains, value.pattern].some(
        (check) => check !== undefined,
      );
      if (value.exists === false && content) {
        ctx.addIssue({
          code: 'custom',
          message: 'A file that must not exist cannot also have content to check.',
          path: ['exists'],
        });
      }
    }),
  z
    .strictObject({
      kind: z.literal('envVar'),
      name: EnvNameSchema,
      scope: z.enum([...EnvScopeSchema.options, 'newTerminal']).optional(),
      // Windows deletes a variable set to '', so an empty value can never be read back.
      equals: z.string().min(1).optional(),
      contains: z.string().min(1).optional(),
      exists: z.boolean().optional(),
      ...labelled,
    })
    .superRefine((value, ctx) => {
      if (value.exists === false && (value.equals !== undefined || value.contains !== undefined)) {
        ctx.addIssue({
          code: 'custom',
          message: 'A variable that must be unset cannot also have a value to check.',
          path: ['exists'],
        });
      }
    }),
]);

/** Validates the predicate language in `predicates.ts`, including nested all/any/not. */
export const PredicateSchema: z.ZodType<Predicate, Predicate> = predicateKinds;

/** The same compile-time proof as for fixtures: every Predicate kind has a schema. */
export const PREDICATE_SCHEMA_MATCHES_DSL: SameType<
  z.output<typeof predicateKinds>,
  Predicate
> = true;

// ---- Helpers for lists and ratings ----------------------------------------------------

/** Rejects a list where two items share an id, pointing at the second one. */
export function checkUniqueIds(
  items: readonly { id: string }[],
  where: string,
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate id "${item.id}".`,
        path: [where, index, 'id'],
      });
    }
    seen.add(item.id);
  });
}

export const QUALITIES = ['strong', 'okay', 'weak'] as const;
export type Quality = (typeof QUALITIES)[number];
