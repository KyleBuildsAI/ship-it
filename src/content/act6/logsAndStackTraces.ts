import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 6.4: reading the evidence a system leaves behind, logs and stack traces, and
 * turning it into a brief that gets Otto to fix a cause instead of hiding a symptom.
 */
export const logsAndStackTraces = {
  id: 'logs-and-stack-traces',
  act: 6,
  title: 'Logs and Stack Traces',
  briefing: [
    'When something breaks, the system has usually already told you why. It wrote it down in a log or a stack trace.',
    'Reading them is how you point Otto at the real problem, instead of letting it guess.',
  ],
  cards: [
    {
      id: 'where-to-look',
      kind: 'choose',
      situation: 'Inviting a teammate crashes. Otto pasted the error from the server log.',
      artifact: {
        kind: 'error',
        label: 'invite-api',
        text: [
          "TypeError: Cannot read properties of undefined (reading 'email')",
          '    at sendInvite (src/invites/send.ts:42:31)',
          '    at handleInvite (src/api/invites.ts:18:11)',
          '    at Layer.handle (node_modules/express/lib/router/layer.js:95:5)',
          '    at next (node_modules/express/lib/router/route.js:149:13)',
          '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
        ].join('\n'),
      },
      question: 'Where do you look first?',
      options: [
        {
          id: 'bottom',
          text: 'node:internal at the bottom, where it all started.',
          correct: false,
          feedback:
            'That’s Node’s own machinery. The bottom is where the chain of calls began, rarely where it went wrong.',
        },
        {
          id: 'library',
          text: 'node_modules/express, since the error passed through it.',
          correct: false,
          feedback:
            'Express just called our code. Library frames are usually messengers, not culprits.',
        },
        {
          id: 'our-frame',
          text: 'src/invites/send.ts line 42: the top frame in our own code.',
          correct: true,
          feedback:
            'Yes. The top is where it failed, and the first file that’s ours is where to look.',
        },
        {
          id: 'message-only',
          text: 'Ignore the trace. The message alone says what’s wrong.',
          correct: false,
          feedback: 'The message says what; the trace says where. You need both.',
        },
      ],
      explanation:
        'A stack trace lists the calls that were running when it failed, newest at the top. Read down to the first frame in your own code: that’s almost always where to start.',
    },
    {
      id: 'what-was-undefined',
      kind: 'choose',
      situation: 'Line 42 of send.ts reads: const to = invite.user.email;',
      question: 'Given that error, what was undefined?',
      options: [
        {
          id: 'user',
          text: 'invite.user, the thing before .email. This invite has no user attached.',
          correct: true,
          feedback: 'Right. The error names the property it tried to read from something missing.',
        },
        {
          id: 'email',
          text: 'email: the user has no email address.',
          correct: false,
          feedback:
            'A common misread. A missing email would just be undefined, quietly. The crash is reading .email from nothing.',
        },
        {
          id: 'invite',
          text: 'invite: the whole invite is missing.',
          correct: false,
          feedback: 'Then the error would say reading “user”, the first property read from it.',
        },
        {
          id: 'format',
          text: 'The email address is badly formatted.',
          correct: false,
          feedback: 'Formatting never causes this error. It’s about a value being undefined.',
        },
      ],
      explanation:
        '“Cannot read properties of undefined (reading X)” means the value just before .X is undefined. Next, find out why that value is missing, before anyone adds a check.',
    },
    {
      id: 'fix-the-cause',
      kind: 'prompt',
      situation: 'You know the crash comes from invites with no user. You’re briefing Otto.',
      question: 'Which instruction leads to a real fix?',
      options: [
        {
          id: 'try-catch',
          text: 'Wrap sendInvite in try/catch so the crash stops.',
          correct: false,
          feedback:
            'The crash stops, and those invites silently never send. Now the bug is invisible.',
        },
        {
          id: 'cause',
          text: 'Here’s the stack trace. Find out how an invite ends up with no user, and reproduce it in a failing test. Then fix the cause, and explain what you changed and why.',
          correct: true,
          feedback:
            'Evidence in, cause first, a test that proves it, and an explanation you can check.',
        },
        {
          id: 'optional-chain',
          text: 'Change it to invite.user?.email so it can’t crash.',
          correct: false,
          feedback:
            'No crash, but now it emails “undefined”. That hides the bug instead of fixing it.',
        },
        {
          id: 'vague',
          text: 'Fix the TypeError in the invites code.',
          correct: false,
          feedback:
            'Otto will likely do the quickest thing that makes the error go away, like the other two shortcuts here.',
        },
      ],
      explanation:
        'Agents are good at making errors disappear, which isn’t the same as fixing them. Ask for the cause, a failing test first, and an explanation. Then you can tell a fix from a cover-up.',
    },
    {
      id: 'swallowed-error',
      kind: 'choose',
      situation:
        'Writers say some invites never arrive, but the logs show no errors at all. You find this in an earlier diff from Otto.',
      artifact: {
        kind: 'diff',
        label: 'src/invites/send.ts',
        text: [
          '   try {',
          '     await mailer.send(to, template);',
          '-  } catch (err) {',
          "-    logger.error({ err, inviteId }, 'invite email failed');",
          '-    throw err;',
          '-  }',
          '+  } catch {}',
        ].join('\n'),
      },
      question: 'Why are the logs empty?',
      options: [
        {
          id: 'mail-down',
          text: 'The mail service is down.',
          correct: false,
          feedback: 'Maybe, but you’d never know: the code throws the evidence away.',
        },
        {
          id: 'logging-off',
          text: 'Logging is turned off in production.',
          correct: false,
          feedback: 'Other errors still show up in the logs. Only this one vanished.',
        },
        {
          id: 'typos',
          text: 'The writers typed the wrong addresses.',
          correct: false,
          feedback: 'That could be one cause, but this code hides every cause equally.',
        },
        {
          id: 'empty-catch',
          text: 'The empty catch swallows every failure: nothing is logged and nobody is told.',
          correct: true,
          feedback: 'Yes. An empty catch turns loud failures into silent ones.',
        },
      ],
      explanation:
        'Never approve an empty catch. Catch an error only to handle it: log it with context, retry, or tell the user. Otherwise let it fail loudly, where someone will see it.',
    },
    {
      id: 'follow-one-request',
      kind: 'choose',
      situation: 'Priya’s save failed at 14:02. The log mixes every user’s requests together.',
      artifact: {
        kind: 'log',
        label: 'docs-api',
        text: [
          '14:02:11.204 INFO  req=a91f PATCH /api/docs/77 user=31 start',
          '14:02:11.209 INFO  req=c3d0 GET /api/docs/12 user=8 start',
          '14:02:11.233 INFO  req=c3d0 200 24ms',
          '14:02:11.250 INFO  req=e72b PATCH /api/docs/77 user=31 start',
          '14:02:11.411 WARN  req=a91f version conflict: doc 77 changed since load',
          '14:02:11.412 INFO  req=a91f 409 208ms',
          '14:02:11.430 INFO  req=e72b 200 180ms',
        ].join('\n'),
      },
      question: 'Priya is user 31. What happened to her first save?',
      options: [
        {
          id: 'nearest-line',
          text: 'It returned 200 at 14:02:11.430.',
          correct: false,
          feedback: 'That’s e72b, her second save. Follow one request id, not the nearest line.',
        },
        {
          id: 'conflict',
          text: 'Request a91f got a 409: the document changed after she loaded it, so the save was refused.',
          correct: true,
          feedback: 'Yes. Following req=a91f joins its start, its warning and its result.',
        },
        {
          id: 'crash',
          text: 'Request c3d0 crashed the server.',
          correct: false,
          feedback: 'c3d0 is user 8 reading a document, and it returned 200.',
        },
        {
          id: 'nothing',
          text: 'Nothing was logged for her.',
          correct: false,
          feedback: 'Look for user=31 and both of her saves appear.',
        },
      ],
      explanation:
        'Busy servers interleave many requests. A request id stamped on every line lets you pull one request’s story out of the noise. 409 Conflict means the data changed underneath you.',
    },
    {
      id: 'brief-logging',
      kind: 'prompt',
      situation:
        'Sign-in problems are hard to debug. You want Otto to add logging to the sign-in flow.',
      question: 'Which instruction?',
      options: [
        {
          id: 'whole-body',
          text: 'Log the full request body for every sign-in, so we have everything.',
          correct: false,
          feedback:
            'The body holds passwords. Logs get copied into many tools and seen by many people, so secrets in logs leak.',
        },
        {
          id: 'console-log',
          text: 'Add console.log at each step so we can see what’s happening.',
          correct: false,
          feedback:
            'Lines with no request id or level are hard to search at 3am, and easy to leave behind.',
        },
        {
          id: 'structured',
          text: 'Log each sign-in attempt with the request id, user id, method and outcome: INFO on success, WARN on failure with the reason. Never log passwords, tokens or session cookies.',
          correct: true,
          feedback: 'Searchable, useful, and safe to share.',
        },
        {
          id: 'debugger',
          text: 'Skip the logs. We can attach a debugger if it breaks.',
          correct: false,
          feedback:
            'You can’t attach a debugger to last night’s failure in production. Logs are the only witness.',
        },
      ],
      explanation:
        'Good logs say when, which request, who, what happened and how it ended, at a level you can filter. They never contain secrets, because logs travel further than you think.',
    },
    {
      id: 'log-levels',
      kind: 'choose',
      situation:
        'The on-call alert fires whenever the logs show an ERROR. It woke Dex three times last night for lines like this.',
      artifact: {
        kind: 'log',
        label: 'auth-api',
        text: '02:13:40.118 ERROR req=77b1 sign-in failed: wrong password user=212',
      },
      question: 'What should change?',
      options: [
        {
          id: 'downgrade',
          text: 'Log a wrong password at WARN. It’s normal user behaviour, not a system failure. Keep ERROR for things someone must fix.',
          correct: true,
          feedback: 'Yes. Levels decide who gets woken up, so they have to mean something.',
        },
        {
          id: 'alert-off',
          text: 'Turn off the alert.',
          correct: false,
          feedback: 'Then real errors would wake nobody either.',
        },
        {
          id: 'stop-logging',
          text: 'Stop logging failed sign-ins.',
          correct: false,
          feedback:
            'A burst of failures can mean someone is guessing passwords. Keep the record, at the right level.',
        },
      ],
      explanation:
        'ERROR should mean “something is broken and a person should look”. When normal events are logged as errors, people learn to ignore alerts, and then they miss the real one.',
    },
    {
      id: 'debug-steps',
      kind: 'order',
      situation: 'Sage asks you to sum up how to chase down a bug report like Priya’s.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'find', text: 'Find the failure in the logs by time or request id' },
        { id: 'trace', text: 'Read the stack trace down to our first frame' },
        { id: 'reproduce', text: 'Reproduce it with a failing test' },
        { id: 'fix', text: 'Fix the cause, not the symptom' },
        { id: 'prove', text: 'See the test pass and the errors stop' },
      ],
      explanation:
        'Evidence, location, reproduction, fix, proof. You can hand Otto any of these steps, but you should know which step you’re on and check its result.',
    },
  ],
} satisfies LessonInput;
