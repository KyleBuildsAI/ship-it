/*
 * Words for a lesson card (LessonView.tsx). They live apart from the components so that
 * file only exports components, which React's fast refresh needs.
 */

/** An answer's feedback, split into the bold verdict and what follows it. */
export interface Feedback {
  readonly verdict: string;
  readonly rest: string;
}

// Feedback that opens with its own verdict, like "Yes." or "Right:". The punctuation
// matters: "Right flag, wrong scope." opens a wrong option's feedback, not a verdict.
const OWN_VERDICT_RIGHT = /^(?:Right|Yes|Exactly|Correct)[.,:;!]/;
const OWN_VERDICT_WRONG = /^(?:Not quite|Not yet|Nope|Wrong|No)[.,:;!]/;

/**
 * The verdict to show in bold before an answer's feedback. Most feedback already opens
 * with one ("Yes. Saved to disk..."), and adding the view's own made it read "Right. Yes.",
 * so that one is used instead. Feedback without one gets "Right." or "Not quite.".
 */
export function splitFeedback(correct: boolean, feedback: string): Feedback {
  const own = (correct ? OWN_VERDICT_RIGHT : OWN_VERDICT_WRONG).exec(feedback);
  if (own !== null) {
    return { verdict: own[0], rest: feedback.slice(own[0].length).trimStart() };
  }
  return { verdict: correct ? 'Right.' : 'Not quite.', rest: feedback };
}
