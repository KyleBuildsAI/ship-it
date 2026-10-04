import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 8.1 Think Out Loud: the coding round. Reading code for bugs, out loud, with no AI in
 * the room. Every snippet is something Otto really wrote for Quillwork, because spotting
 * an agent's bug and spotting your own are the same skill.
 */
export const thinkOutLoud = {
  id: 'think-out-loud',
  act: 8,
  title: 'Think Out Loud',
  briefing: [
    'Sage is running your mock loop for a full-time role at Quillwork. Every question comes from something that really happened here.',
    'First, the coding round: no AI. Read code for bugs and say what you’re thinking, so the interviewer can follow.',
  ],
  cards: [
    {
      id: 'clarify',
      kind: 'choose',
      situation:
        'Sage reads you a real Marco ticket: “Dedupe the newsletter list before Friday’s send.” The list has 48,000 signups.',
      question: 'What do you say first?',
      options: [
        {
          id: 'start',
          text: 'Nothing yet. Start writing the loop so there’s code on the screen.',
          correct: false,
          feedback:
            'Fast code for the wrong rule is still wrong. You don’t know what counts as a duplicate.',
        },
        {
          id: 'ask',
          text: 'Ask: is “Kyle@x.com” the same as “kyle@x.com”? Keep the first signup or the newest? Must the order stay?',
          correct: true,
          feedback: 'Those answers decide the code. Now you’re solving the real task.',
        },
        {
          id: 'otto',
          text: 'Say you’d hand it to Otto and check the result later.',
          correct: false,
          feedback: 'This round has no AI. And Otto would need those same answers anyway.',
        },
      ],
      explanation:
        'Interviewers leave tasks vague on purpose. Asking what counts as a duplicate, which copy wins and whether order matters turns a vague ticket into a spec, the same spec you’d give an agent.',
    },
    {
      id: 'off-by-one',
      kind: 'choose',
      situation:
        'Priya says page 2 of the customers table is missing someone, and so is every other page. Sage shows the function behind it.',
      artifact: {
        kind: 'code',
        label: 'customers.py',
        text: [
          'def page(items, number, size=20):',
          '    """Page 0 is the first page."""',
          '    start = number * size',
          '    return items[start:start + size - 1]',
        ].join('\n'),
      },
      question: 'Where’s the bug?',
      options: [
        {
          id: 'start',
          text: 'start should be (number + 1) * size.',
          correct: false,
          feedback: 'The docstring says page 0 is first, so number * size is right.',
        },
        {
          id: 'crash',
          text: 'The slice crashes on the last page, when there aren’t 20 items left.',
          correct: false,
          feedback: 'Python slices stop quietly at the end of a list. No crash.',
        },
        {
          id: 'minus-one',
          text: 'The slice end is already left out, so the “- 1” drops one customer from every page.',
          correct: true,
          feedback: 'Yes. Each page shows 19 people, and the 20th is never seen.',
        },
        {
          id: 'default',
          text: 'The default size of 20 is too big.',
          correct: false,
          feedback: 'The size is a choice, not the bug. 19 of 20 would still go missing.',
        },
      ],
      explanation:
        'Off-by-one bugs live at boundaries. Trace a tiny case out loud: page 0 with size 2 should give items 0 and 1. Here it gives only item 0. Small examples catch what reading misses.',
    },
    {
      id: 'shared-default',
      kind: 'choose',
      situation:
        'Every invoice Quillwork sent today carries every tag anyone added all day: “refund”, “vip”, “late”. Otto wrote the tagging code.',
      artifact: {
        kind: 'code',
        label: 'invoices.py',
        text: [
          'def add_tag(invoice, tag, tags=[]):',
          '    tags.append(tag)',
          '    invoice["tags"] = tags',
          '    return invoice',
        ].join('\n'),
      },
      question: 'Why do the tags pile up?',
      options: [
        {
          id: 'database',
          text: 'The database is saving tags to the wrong invoice.',
          correct: false,
          feedback: 'There’s no database here. The pile-up happens in this function.',
        },
        {
          id: 'append',
          text: 'append() adds the tag twice.',
          correct: false,
          feedback: 'It adds it once. The question is which list it adds to.',
        },
        {
          id: 'shared-list',
          text: 'The [] default is made once and shared by every call, so each call adds to the same list.',
          correct: true,
          feedback: 'Right. Default with None and make a fresh list inside the function.',
        },
      ],
      explanation:
        'A default value is created once, when Python reads the function, not on every call. A list default is shared by all callers. Spotting it shows you know how the language actually behaves, not just how it looks.',
    },
    {
      id: 'reading-order',
      kind: 'order',
      situation:
        'Sage asks how you read a function you’ve never seen when someone says it has a bug.',
      question: 'Put your method in order.',
      steps: [
        { id: 'promise', text: 'Read its name and what it promises to return' },
        { id: 'inputs', text: 'List the inputs and what values they can take' },
        { id: 'trace', text: 'Trace one tiny example by hand' },
        { id: 'edges', text: 'Try the edges: empty, one item, the last one' },
        { id: 'report', text: 'Say what you found and how sure you are' },
      ],
      explanation:
        'Promise, inputs, a tiny trace, the edges, then a clear verdict. Saying each step out loud shows a method, and it’s exactly how you review an agent’s diff too.',
    },
    {
      id: 'slow-dedupe',
      kind: 'choose',
      situation:
        'Otto’s dedupe script for the 48,000 signups took several minutes, and each time the list doubles it takes four times as long.',
      artifact: {
        kind: 'code',
        label: 'dedupe.py',
        text: [
          'def dedupe(emails):',
          '    seen = []',
          '    result = []',
          '    for email in emails:',
          '        key = email.lower()',
          '        if key not in seen:',
          '            seen.append(key)',
          '            result.append(email)',
          '    return result',
        ].join('\n'),
      },
      question: 'Why is it slow?',
      options: [
        {
          id: 'python',
          text: 'Python is slow. It needs rewriting in a faster language.',
          correct: false,
          feedback: 'The language isn’t the problem. The same idea would be slow in any language.',
        },
        {
          id: 'lower',
          text: 'Calling lower() on every email.',
          correct: false,
          feedback: 'That’s cheap and done once per email. Look at what the if does.',
        },
        {
          id: 'list-search',
          text: '“not in seen” searches the whole list each time. Make seen a set and lookups become near-instant.',
          correct: true,
          feedback: 'Yes. A list search grows with the list; a set lookup doesn’t.',
        },
      ],
      explanation:
        'Checking a list scans every item, so a loop of list checks grows with the square of the input. A set or dict answers “have I seen this?” almost instantly. Say why code is slow, not just that it is.',
    },
    {
      id: 'prove-the-fix',
      kind: 'prompt',
      situation:
        'Otto opens a PR fixing the page bug: he deleted the “- 1”. The CI is green, but there were no tests for paging before.',
      question: 'What do you tell Otto before you approve it?',
      options: [
        {
          id: 'works',
          text: 'Make sure it works.',
          correct: false,
          feedback: 'Otto will say it works. Nothing in that instruction asks for proof.',
        },
        {
          id: 'edge-tests',
          text: 'Add tests: 45 customers, size 20; pages 0 and 1 must each return 20 with nobody skipped, page 2 returns 5, an empty list returns nothing. Show me the full-page tests fail without your fix and all pass with it.',
          correct: true,
          feedback:
            'Named cases plus fail-then-pass on the full pages, where people went missing, proves the tests catch the bug and keep it caught.',
        },
        {
          id: 'try-except',
          text: 'Wrap it in try/except so paging can never crash.',
          correct: false,
          feedback:
            'It never crashed. It silently dropped people. A try/except hides bugs, it doesn’t prove fixes.',
        },
        {
          id: 'clean-up',
          text: 'While you’re in there, clean up the whole customers module.',
          correct: false,
          feedback:
            'A one-line fix grows into a big diff nobody can review. Keep the PR to the bug.',
        },
      ],
      explanation:
        'Green CI with no tests proves nothing about the change. Ask for tests at the boundaries, and for proof they fail before the fix, so you know the test can catch the bug at all.',
    },
    {
      id: 'stuck',
      kind: 'choose',
      situation:
        'Two minutes into a problem, you’re stuck. The interviewer is watching the empty editor.',
      question: 'Best move?',
      options: [
        {
          id: 'say',
          text: 'Say where you’re stuck and what you’ve tried, then solve a smaller version first.',
          correct: true,
          feedback: 'Now the interviewer can follow, and can help if you ask.',
        },
        {
          id: 'quiet',
          text: 'Stay quiet until the answer comes to you.',
          correct: false,
          feedback: 'Silence looks exactly like giving up.',
        },
        {
          id: 'busy',
          text: 'Type code you know is wrong, so you look busy.',
          correct: false,
          feedback: 'It wastes time, and the interviewer can tell.',
        },
      ],
      explanation:
        'Getting stuck is normal; going silent is the mistake. Narrate it, shrink the problem, or write the slow version first and improve it. Working code beats a perfect idea you never wrote.',
    },
    {
      id: 'practice-partner',
      kind: 'prompt',
      situation:
        'The real coding round allows no AI. You want Claude to help you practise for it, without doing the work for you.',
      question: 'Which instruction do you give?',
      options: [
        {
          id: 'answers',
          text: 'Solve ten common interview problems so I can memorise the answers.',
          correct: false,
          feedback: 'Memorised answers fall apart at the first follow-up question.',
        },
        {
          id: 'flatter',
          text: 'Look at my code and tell me it’s good, so I feel confident.',
          correct: false,
          feedback:
            'Flattery doesn’t prepare you. Ask for the honest review an interviewer would give.',
        },
        {
          id: 'coach',
          text: 'Give me one interview-level Python problem. No hints unless I ask. When I submit, review it like an interviewer: correctness, edge cases, speed, and how clearly I explained it.',
          correct: true,
          feedback: 'The solving stays yours, and the feedback stays honest.',
        },
      ],
      explanation:
        'AI is a great practice partner when you set the rules: it asks, you solve, it reviews. The round itself has no AI, so the skill has to be in your head, not in the chat.',
    },
  ],
} satisfies LessonInput;
