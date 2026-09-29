import { z } from 'zod';
import { NameSchema, ScreenTextSchema } from './schemaParts';

/*
 * The roadmap: every Act of the course (DESIGN.md section 11), built or not. Preview mode
 * shows it, so what's planned sits next to what's playable and each says which it is. It's
 * content, so the words live in src/content/roadmap.ts and are checked here. Nothing on
 * the roadmap can be played: playable Acts come from the catalog.
 */

/** The number of Acts in the course, Act 1 to Act 8. */
export const ACT_COUNT = 8;

/**
 * How far along an Act is today. 'playable': in the catalog, with missions to play.
 * 'preview': parts of its engine work, but no mission does yet. 'planned': only planned.
 */
export const STAGES = ['playable', 'preview', 'planned'] as const;
export type Stage = (typeof STAGES)[number];

/**
 * Things that already work in an Act that has no missions yet, each a row in its preview
 * menu: the laptop to type on, and Otto's scripted demo.
 */
export const TRYOUTS = ['laptop-sandbox', 'otto-demo'] as const;
export type Tryout = (typeof TRYOUTS)[number];

/** A mission, boss or Field Mission DESIGN.md plans, by the title it will have. */
const PartSchema = z.strictObject({ title: NameSchema });

export const RoadmapActSchema = z
  .strictObject({
    act: z.int().min(1).max(ACT_COUNT),
    title: NameSchema,
    /** The Act's topic line, from DESIGN.md section 11. */
    topics: ScreenTextSchema,
    stage: z.enum(STAGES),
    /** One line under the title in preview mode: where the Act stands today. */
    status: ScreenTextSchema,
    /** The missions DESIGN.md names for it. An Act planned as one topic line has none yet. */
    missions: z.array(PartSchema).max(6).default([]),
    boss: PartSchema,
    fieldMission: PartSchema.optional(),
    tryouts: z.array(z.enum(TRYOUTS)).default([]),
  })
  .superRefine((entry, ctx) => {
    // A playable Act's menu comes from the catalog, which never shows these rows.
    if (entry.stage === 'playable' && entry.tryouts.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['tryouts'],
        message: 'A playable Act has missions to play, so it lists no tryouts.',
      });
    }
  });

export type RoadmapAct = z.output<typeof RoadmapActSchema>;
export type RoadmapActInput = z.input<typeof RoadmapActSchema>;

/** Every Act, in order, exactly once, so a preview tab exists for each. */
export const RoadmapSchema = z
  .array(RoadmapActSchema)
  .length(ACT_COUNT)
  .superRefine((acts, ctx) => {
    acts.forEach((entry, index) => {
      if (entry.act !== index + 1) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'act'],
          message: `List the Acts in order: this one should be Act ${String(index + 1)}.`,
        });
      }
    });
  });
