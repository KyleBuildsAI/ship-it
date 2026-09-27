import { z } from 'zod';

/**
 * Background music: calm classical recordings streamed from Wikimedia Commons, so no
 * audio files live in the repo. Every recording here was checked on its Commons file
 * page for a license on the recording itself (not only the composition, which is old
 * enough to be public domain anyway), and every file answers with cross-origin access
 * allowed so a browser can stream it.
 */

export const trackSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  composer: z.string().min(1),
  title: z.string().min(1),
  performer: z.string().min(1),
  /** The audio file itself, streamed straight from Wikimedia's file servers. */
  url: z.url().startsWith('https://upload.wikimedia.org/'),
  /** The Commons page for the file: its license, author, and source. */
  page: z.url().startsWith('https://commons.wikimedia.org/wiki/File:'),
  license: z.enum(['CC0 1.0', 'CC BY 3.0', 'Public domain']),
  seconds: z.number().positive(),
});

export type Track = z.infer<typeof trackSchema>;

export const TRACKS: readonly Track[] = [
  {
    id: 'bach-prelude-c',
    composer: 'J. S. Bach',
    title: 'Prelude No. 1 in C major, BWV 846',
    performer: 'Kimiko Ishizaka (Open Well-Tempered Clavier)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Kimiko_Ishizaka_-_Bach_-_Well-Tempered_Clavier%2C_Book_1_-_01_Prelude_No._1_in_C_major%2C_BWV_846.ogg',
    page: 'https://commons.wikimedia.org/wiki/File:Kimiko_Ishizaka_-_Bach_-_Well-Tempered_Clavier,_Book_1_-_01_Prelude_No._1_in_C_major,_BWV_846.ogg',
    license: 'CC0 1.0',
    seconds: 163,
  },
  {
    id: 'bach-goldberg-aria',
    composer: 'J. S. Bach',
    title: 'Goldberg Variations, BWV 988: Aria',
    performer: 'Kimiko Ishizaka (Open Goldberg Variations)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Goldberg_Variations_01_Aria.ogg',
    page: 'https://commons.wikimedia.org/wiki/File:Goldberg_Variations_01_Aria.ogg',
    license: 'CC0 1.0',
    seconds: 300,
  },
  {
    id: 'bach-air',
    composer: 'J. S. Bach',
    title: 'Air on the G String, BWV 1068',
    performer: 'United States Air Force Band, Air Force Strings',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Air_-_Air_Force_Strings_-_United_States_Air_Force_Band.mp3',
    page: 'https://commons.wikimedia.org/wiki/File:Air_-_Air_Force_Strings_-_United_States_Air_Force_Band.mp3',
    license: 'Public domain',
    seconds: 183,
  },
  {
    id: 'satie-gymnopedie-1',
    composer: 'Erik Satie',
    title: 'Gymnopédie No. 1',
    performer: 'Robin Alciatore (Musopen)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/90/Erik_Satie_-_gymnopedies_-_la_1_ere._lent_et_douloureux.ogg',
    page: 'https://commons.wikimedia.org/wiki/File:Erik_Satie_-_gymnopedies_-_la_1_ere._lent_et_douloureux.ogg',
    license: 'Public domain',
    seconds: 184,
  },
  {
    id: 'debussy-clair-de-lune',
    composer: 'Claude Debussy',
    title: 'Clair de lune',
    performer: 'Laurens Goedhart',
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg',
    page: 'https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg',
    license: 'CC BY 3.0',
    seconds: 304,
  },
  {
    id: 'pachelbel-canon',
    composer: 'Johann Pachelbel',
    title: 'Canon in D (arranged by Frank Hudson)',
    performer: 'United States Air Force Band, Strolling Strings',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/12/Canon_%282004%29_-_Strolling_Strings_-_United_States_Air_Force_Band.mp3',
    page: 'https://commons.wikimedia.org/wiki/File:Canon_(2004)_-_Strolling_Strings_-_United_States_Air_Force_Band.mp3',
    license: 'Public domain',
    seconds: 229,
  },
  {
    id: 'chopin-nocturne-9-2',
    composer: 'Frédéric Chopin',
    title: 'Nocturne in E-flat major, Op. 9 No. 2',
    performer: 'Frank Lévy (Musopen, Set Chopin Free)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/89/Chopin_-_Nocturne_No._2_in_E-flat_major%2C_Op._9_No._2_%28Frank_Levy%29.flac/Chopin_-_Nocturne_No._2_in_E-flat_major%2C_Op._9_No._2_%28Frank_Levy%29.flac.mp3',
    page: 'https://commons.wikimedia.org/wiki/File:Chopin_-_Nocturne_No._2_in_E-flat_major,_Op._9_No._2_(Frank_Levy).flac',
    license: 'Public domain',
    seconds: 271,
  },
  {
    id: 'grieg-morning-mood',
    composer: 'Edvard Grieg',
    title: 'Morning Mood, from Peer Gynt',
    performer: 'Czech National Symphony Orchestra (Musopen)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Musopen_-_Morning.ogg',
    page: 'https://commons.wikimedia.org/wiki/File:Musopen_-_Morning.ogg',
    license: 'Public domain',
    seconds: 229,
  },
  {
    id: 'schumann-traumerei',
    composer: 'Robert Schumann',
    title: 'Träumerei, from Kinderszenen',
    performer: 'Donald Betts (Musopen)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Robert_Schumann_-_scenes_from_childhood%2C_op._15_-_vii._dreaming.ogg',
    page: 'https://commons.wikimedia.org/wiki/File:Robert_Schumann_-_scenes_from_childhood,_op._15_-_vii._dreaming.ogg',
    license: 'Public domain',
    seconds: 203,
  },
  {
    id: 'mozart-k465-andante',
    composer: 'W. A. Mozart',
    title: 'String Quartet No. 19, K. 465: Andante cantabile',
    performer: 'Musopen String Quartet',
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/7/7f/Mozart_-_String_Quartet_No._19_in_C_major%2C_K465_%27Dissonance%27_-_II._Andante_cantabile_%28Musopen_String_Quartet%29.flac/Mozart_-_String_Quartet_No._19_in_C_major%2C_K465_%27Dissonance%27_-_II._Andante_cantabile_%28Musopen_String_Quartet%29.flac.mp3',
    page: "https://commons.wikimedia.org/wiki/File:Mozart_-_String_Quartet_No._19_in_C_major,_K465_'Dissonance'_-_II._Andante_cantabile_(Musopen_String_Quartet).flac",
    license: 'Public domain',
    seconds: 461,
  },
];

/** The credit line for a track, as its license asks (CC BY needs one; the rest get one anyway). */
export function creditFor(track: Track): string {
  return `${track.composer}, ${track.title}. Performed by ${track.performer}. ${track.license}, via Wikimedia Commons.`;
}
