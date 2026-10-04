import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 6.2: REST and JSON, the shape of an API's promises, and auth: API keys, OAuth
 * and sessions. Most cards are about what to approve or ask for, because Otto writes
 * the code and Kyle decides whether it keeps the promise and the secrets.
 */
export const apisAndAuth = {
  id: 'apis-and-auth',
  act: 6,
  title: 'APIs and Auth',
  briefing: [
    'An API is a promise: send this, get that back. Our web app, our mobile app and our customers’ scripts all rely on Quillwork’s.',
    'Today: REST and JSON, the shape of those promises, and auth, which is how the server knows who is asking and what they may do.',
  ],
  cards: [
    {
      id: 'rest-design',
      kind: 'choose',
      situation:
        'Otto proposed endpoints for documents. Sage asks which plan follows REST, the style the rest of our API uses.',
      question: 'Which plan should you approve?',
      options: [
        {
          id: 'verbs',
          text: 'POST /getDocs, POST /createDoc, POST /deleteDoc',
          correct: false,
          feedback:
            'Verbs in the path and POST for everything. Clients can’t tell which calls are safe to repeat or cache.',
        },
        {
          id: 'rest',
          text: 'GET /api/docs, POST /api/docs, PATCH /api/docs/:id, DELETE /api/docs/:id',
          correct: true,
          feedback: 'Nouns in the path, the method as the verb. Anyone can guess the rest.',
        },
        {
          id: 'get-delete',
          text: 'GET /api/docs?action=delete&id=4',
          correct: false,
          feedback: 'A GET that deletes. A crawler or a link preview could wipe documents.',
        },
        {
          id: 'one-endpoint',
          text: 'One endpoint, POST /api, with the action in the body.',
          correct: false,
          feedback:
            'It works, but throws away what HTTP gives you: caching, meaningful status codes, readable logs.',
        },
      ],
      explanation:
        'REST names things with paths (/api/docs/42) and uses HTTP methods as the verbs. When every resource works the same way, people and agents can predict an API they have never seen.',
    },
    {
      id: 'json-null',
      kind: 'choose',
      situation: 'Otto’s code runs doc.owner.name on this response, and some pages crash.',
      artifact: {
        kind: 'response',
        label: 'GET /api/docs/412',
        text: [
          '{',
          '  "id": 412,',
          '  "title": "Launch post",',
          '  "tags": ["blog", "draft"],',
          '  "owner": null,',
          '  "wordCount": 1180',
          '}',
        ].join('\n'),
      },
      question: 'What’s true about this JSON?',
      options: [
        {
          id: 'tags-string',
          text: 'tags is one string.',
          correct: false,
          feedback: 'Square brackets mean a list. tags holds two strings.',
        },
        {
          id: 'owner-missing',
          text: 'owner is missing, so the API is broken.',
          correct: false,
          feedback: 'owner is there, with the value null. Missing and null are different things.',
        },
        {
          id: 'count-text',
          text: 'wordCount is text, so it needs converting before any maths.',
          correct: false,
          feedback: 'There are no quotes around 1180, so it’s already a number.',
        },
        {
          id: 'owner-null',
          text: 'owner is null, say because the owner left the workspace, so doc.owner.name crashes. The code must handle “no owner”.',
          correct: true,
          feedback: 'Yes. Read every type, and look hardest at null.',
        },
      ],
      explanation:
        'JSON has objects {}, lists [], strings in quotes, numbers, true and false, and null. Many crashes come from assuming a value is there when it’s null or missing.',
    },
    {
      id: 'keep-the-contract',
      kind: 'prompt',
      situation:
        'The mobile app shows each document’s title. You want the API to send a word count too. Marco suggests renaming title to name while you’re in there.',
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'rename',
          text: 'Rename title to name and add wordCount. Update the web app to match.',
          correct: false,
          feedback:
            'Phones running last month’s app still read title. They’d show blank titles until every writer updates.',
        },
        {
          id: 'cleanest',
          text: 'Return whatever shape is cleanest now. The mobile team will adapt.',
          correct: false,
          feedback:
            'An API is a promise to people you can’t update. Breaking it breaks them, silently.',
        },
        {
          id: 'additive',
          text: 'Add wordCount as a new field on GET /api/docs/:id. Don’t rename or remove existing fields: older mobile apps still read them. Add a test that pins the response shape.',
          correct: true,
          feedback:
            'Adding is safe; renaming breaks every client you don’t control. The test keeps the promise.',
        },
      ],
      explanation:
        'Once others call your API, its shape is a contract. Adding fields is safe; renaming or removing them breaks clients. Say so in the brief, because an agent tidying code will happily rename things.',
    },
    {
      id: 'auth-kinds',
      kind: 'choose',
      situation:
        'Writers sign in to Quillwork with Google. Separately, our server calls a payments provider to charge subscriptions.',
      question: 'Which kind of auth fits each?',
      options: [
        {
          id: 'right',
          text: 'OAuth for signing in with Google, and a secret API key kept on our server for the payments provider.',
          correct: true,
          feedback:
            'OAuth lets people grant access without sharing a password; a key proves which server is calling.',
        },
        {
          id: 'password',
          text: 'Ask writers for their Google password and check it ourselves.',
          correct: false,
          feedback: 'Never. OAuth exists so your app never sees anyone’s Google password.',
        },
        {
          id: 'key-in-browser',
          text: 'Put the payments API key in the web app, so the browser can charge cards directly.',
          correct: false,
          feedback: 'Anyone can open browser code, copy the key and charge cards as us.',
        },
        {
          id: 'shared-key',
          text: 'Give every writer the same API key to sign in with.',
          correct: false,
          feedback: 'Then the server can’t tell writers apart, and one leak exposes everyone.',
        },
      ],
      explanation:
        'OAuth: a person lets your app act for them on another site, without giving you their password. API key: your server proves who it is to another service. Keys live only on servers.',
    },
    {
      id: 'sessions',
      kind: 'choose',
      situation:
        'Priya signed in this morning. Now she clicks Save. HTTP itself remembers nothing between requests.',
      question: 'How does the server know this request is Priya’s?',
      options: [
        {
          id: 'password',
          text: 'Her browser sends her password with every request.',
          correct: false,
          feedback: 'Every request would be a chance to leak it. She sends it once, at sign-in.',
        },
        {
          id: 'ip',
          text: 'The server remembers her IP address.',
          correct: false,
          feedback:
            'IP addresses change, and whole offices and cafés share one. They don’t identify a person.',
        },
        {
          id: 'cookie',
          text: 'Her browser sends the session cookie it got at sign-in, and the server looks that session up.',
          correct: true,
          feedback: 'Right. The cookie is a ticket; the server keeps the list of valid tickets.',
        },
        {
          id: 'open-connection',
          text: 'The connection from sign-in stays open all day.',
          correct: false,
          feedback: 'Connections come and go constantly. Each request must say who it’s from.',
        },
      ],
      explanation:
        'Sign-in creates a session and gives the browser a cookie holding its id. Every request carries the cookie. Sign-out or expiry ends the session, which is why an expired one gets a 401.',
    },
    {
      id: 'key-in-the-browser',
      kind: 'choose',
      situation: 'Otto opened a PR that shows billing plans. Read this part of its diff.',
      artifact: {
        kind: 'diff',
        label: 'PR #88 src/web/billing.ts',
        text: [
          '+const payments = new PaymentsClient(',
          '+  import.meta.env.VITE_PAYMENTS_SECRET_KEY,',
          '+);',
          '+',
          '+export async function listPlans() {',
          '+  return payments.plans.list();',
          '+}',
        ].join('\n'),
      },
      question: 'What do you say in the review?',
      options: [
        {
          id: 'env-ok',
          text: 'Looks good: the key comes from an environment variable, not the code.',
          correct: false,
          feedback:
            'On a server, yes. But Vite bakes VITE_ variables into the browser bundle, which anyone can read.',
        },
        {
          id: 'server-side',
          text: 'Request changes: a secret key can’t ship to the browser. Move this call to our server, and have the web app call our own endpoint.',
          correct: true,
          feedback: 'Yes. The browser asks our server; only the server holds the key.',
        },
        {
          id: 'rename',
          text: 'Rename it VITE_PAYMENTS_KEY so it’s less obvious.',
          correct: false,
          feedback: 'A new name hides nothing. The value still ships to every visitor.',
        },
      ],
      explanation:
        'Anything in the web app runs on the user’s machine, so treat it as public. Secrets stay on servers. If one ever ships or gets committed, rotate it: deleting it later doesn’t un-leak it.',
    },
    {
      id: 'least-scope',
      kind: 'prompt',
      situation:
        'Quillwork will let writers publish posts to their own GitHub repos. You’re briefing Otto on how to connect to GitHub.',
      question: 'Which instruction?',
      options: [
        {
          id: 'paste-token',
          text: 'Ask each writer to paste a personal access token with full repo access into settings.',
          correct: false,
          feedback:
            'Full access to every repo is far more than publishing needs, and pasted tokens get stored and leaked carelessly.',
        },
        {
          id: 'my-token',
          text: 'Use my personal GitHub token for every writer. It’s simpler.',
          correct: false,
          feedback:
            'Every post would publish as you, with your access to everything. One leak exposes your account.',
        },
        {
          id: 'every-scope',
          text: 'Use OAuth, and request every scope GitHub offers in case we need them later.',
          correct: false,
          feedback:
            'Writers see a scary permission screen, and a leaked token could do anything. Ask for the least you need.',
        },
        {
          id: 'least',
          text: 'Use GitHub OAuth. Request only the scope needed to write to the repo the writer picks. Store tokens encrypted on our server, never in the browser, and ask them to reconnect if a token is revoked.',
          correct: true,
          feedback:
            'Each writer grants only what publishing needs, can revoke it any time, and you planned for that.',
        },
      ],
      explanation:
        'Least privilege: ask for the smallest access that does the job. Agents tend to grab broad permissions because it makes things work, so name the scope in your brief.',
    },
    {
      id: 'oauth-flow',
      kind: 'order',
      situation: 'A writer clicks “Sign in with Google” on Quillwork.',
      question: 'Put the OAuth sign-in in order.',
      steps: [
        { id: 'redirect', text: 'Quillwork sends the writer to Google’s sign-in page' },
        { id: 'approve', text: 'The writer signs in at Google and approves access' },
        { id: 'code', text: 'Google sends them back with a one-time code' },
        { id: 'swap', text: 'Quillwork’s server swaps the code for a token' },
        { id: 'session', text: 'The server creates a session and sets a cookie' },
      ],
      explanation:
        'The password only ever goes to Google. Quillwork gets a code, swaps it server to server for a token, and from then on uses its own session.',
    },
  ],
} satisfies LessonInput;
