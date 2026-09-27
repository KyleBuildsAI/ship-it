import type { Predicate } from '../../game/missions/predicates';

/**
 * Commit message rules shared by every Act 2 mission and the boss. The type list and
 * the optional "(scope)" and "!" match the Field Mission's paste checker in
 * engine/verify, so a message that passes in the sandbox also passes on SandCastles.
 */
const TYPES = 'feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert';
const SCOPE_AND_BREAKING = '(\\([^()\\s][^()]*\\))?!?';

/** A Conventional Commit subject: `type(scope)!: description`, scope and ! optional. */
export const CONVENTIONAL_PATTERN = `^(${TYPES})${SCOPE_AND_BREAKING}: \\S`;

/** The same shape, but only for one type, e.g. `fix` or `docs`. */
export function typePattern(type: string): string {
  return `^${type}${SCOPE_AND_BREAKING}: \\S`;
}

/**
 * The newest commit uses any Conventional Commit type. Labelled, because the raw
 * regular expression would mean nothing to a player reading the checklist.
 */
export function headIsConventional(): Predicate {
  return {
    kind: 'headMessage',
    pattern: CONVENTIONAL_PATTERN,
    label: 'The message starts with a type, like "feat: ..."',
  };
}

/** The newest commit uses one specific Conventional Commit type. */
export function headIsType(type: string): Predicate {
  return {
    kind: 'headMessage',
    pattern: typePattern(type),
    label: `The message starts with "${type}:"`,
  };
}
