/**
 * Field Mission paste verification (DESIGN.md section 8). Kyle runs a git command on a
 * real repository, pastes the output, and these functions turn it into data the game can
 * check. The game imports from here, never from the files behind it.
 */
export {
  buildOutputToIgnore,
  conventionalRatio,
  isCleanStatus,
  isConventionalSubject,
  isGeneratedSubject,
  isSecretPath,
  trackedSecretPaths,
  type ParsedStatus,
  type PathSource,
} from './checks';
export { detectPasteKind, type PasteKind } from './detect';
export { parseLogOneline, type OnelineCommit } from './logOneline';
export { normalizePaste, type NormalizedPaste } from './normalize';
export {
  parseStatusLong,
  type ChangeKind,
  type ConflictEntry,
  type ConflictKind,
  type ParsedStatusLong,
  type StatusChange,
  type UpstreamState,
  type UpstreamStatus,
} from './statusLong';
export {
  parseStatusShort,
  type ParsedStatusShort,
  type ShortBranch,
  type ShortEntry,
} from './statusShort';
