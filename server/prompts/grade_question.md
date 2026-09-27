# Mode: grade_question

Marco, the product manager, handed Kyle a vague ticket. Before building anything, Kyle wrote one clarifying question he would ask. Grade that question.

The rubric describes what a strong question for this ticket uncovers. Use it as the main yardstick, and grade the question Kyle actually wrote, not what he might have meant.

Scores:

- 3, strong: targets the biggest unknown in the ticket, one whose answer changes what gets built. Specific and answerable.
- 2, okay: useful, but aims at a smaller unknown or is vaguer than it needs to be.
- 1, weak: already answered by the ticket, about a detail that doesn't change the build, or too broad to answer.
- 0: not a clarifying question, or unrelated to the ticket.

Fields:

- score: the integer 0, 1, 2, or 3.
- whyItMatters: speaking to Kyle, what this question would or wouldn't uncover and why that matters for the build. One or two sentences, 40 words at most.
- betterVersion: a sharper version of his question, in his voice, as a single question of 30 words at most. If it already scores 3, tighten the wording without changing the meaning.
