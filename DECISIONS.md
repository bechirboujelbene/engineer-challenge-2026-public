# DECISIONS

What I changed, what I found, and what I deliberately left alone.
(~3–4 hour budget; priorities: security → correctness → foundation.)

## What I found (initial audit)

Reading the codebase end-to-end surfaced these issues, roughly by severity:

**Security**
- Auth uses `jwt.decode()` instead of `jwt.verify()` — any forged token passes
  authentication (`server/src/auth.ts`, and again in `getExportUser`)
- SQL injection in `/feedback` (status, q), `/metrics`, `/export.csv`,
  `/feedback/:id/assignment`, and `/feedback/:id/notes` (GET)
- Stored XSS: message, notes, and LLM summary rendered with
  `dangerouslySetInnerHTML` (seed data even contains HTML payloads)
- Passwords stored and compared in plaintext
- JWT secret hardcoded in source; `JWT_SECRET` env var ignored
- Token passed as a query param for CSV export (leaks into logs/history);
  bearer tokens logged via `console.error`
- CSV formula injection (`=HYPERLINK(...)` in seed data proves it)
- `/users` returns the password column (`SELECT *`)
- OpenAI key exposed to the browser via `VITE_OPENAI_API_KEY` / `x-llm-key`

**Correctness**
- Pagination off-by-one: `offset = page * PAGE_SIZE` skips the first page
- `total` count ignores active filters, so page count is wrong when filtering
- `/feedback/:id/resolve` toggles instead of setting a target status → races
  with the optimistic UI and the 45s polling merge (which also has a stale
  closure over `items`)
- `/summarize` crashes on unknown feedback id; no handling of LLM API errors
- Assignment update writes literal `'undefined'` strings into `due_at`
- No input validation anywhere; failures swallowed (`catch (e) {}`)
- Search fires a request per keystroke; no loading or error states

**Foundation**
- No tests, no lint config, no error middleware, no migrations, no indexes
- N+1 queries in `serializeFeedback`
- Joke/demo UI copy (marquee, emoji) not fit for a client

## What I changed

### Remove stored XSS, hash passwords, strip /users, remove browser-exposed API key
- What: Four security fixes in one pass:
  1. **Stored XSS** — Removed all three `dangerouslySetInnerHTML` usages in
     `ItemDetail.tsx` (feedback message, LLM summary, internal notes). React
     now renders these as text, which auto-escapes HTML. Added
     `white-space: pre-wrap` + `word-break: break-word` to `.message` and
     `.note` in CSS so line breaks are still preserved without HTML.
  2. **Plaintext passwords** — Added `bcryptjs`; seed now hashes passwords
     with bcrypt (cost 10), login uses `bcrypt.compareSync`. The DB stores
     `$2b$10$...` hashes instead of plaintext.
  3. **`/users` password leak** — Changed `SELECT *` to
     `SELECT id, email, name, role` so the password column is never sent to
     the client. Removed the optional `password?` field from the frontend
     `User` type.
  4. **OpenAI key in browser** — Removed `VITE_OPENAI_API_KEY` from
     `config.ts`, `api.ts` (the `x-llm-key` header on the summarize call),
     and `web/.env.example`. The server already reads `OPENAI_API_KEY` from
     its own server-side env, so the browser-sent key was both useless and
     a credential leak — any `VITE_*` variable is embedded in the JS bundle
     and visible to anyone who opens devtools.
- Why: `dangerouslySetInnerHTML` on user-controlled content (customer
  feedback messages, agent notes, LLM output) is a textbook stored XSS
  vector — the seed data even includes `<strong>` and `<em>` payloads to
  prove it. Plaintext password storage means a single DB leak exposes every
  account. `/users` returning the password column (even hashed) is
  unnecessary surface area. Shipping an API key to the browser via
  `VITE_*` makes it public — anyone can extract it from the bundle and
  make OpenAI calls billed to the account.

- Replaced every string-interpolated SQL query with
  parameterized `?` placeholders across `/feedback`, `/metrics`,
  `/export.csv`, `/feedback/:id/assignment`, and `/feedback/:id/notes` (GET).
  Added input validation: `status` is whitelisted against
  `['all','open','resolved']`, `priority` against
  `['low','normal','high','urgent']` — invalid values return 400 instead of
  reaching the DB. Fixed `csvCell` to prefix cells starting with `= + - @`
  with a single quote, neutralizing CSV formula injection (the seed data's
  `=HYPERLINK(...)` message now exports as `'=HYPERLINK(...)`). Also removed
  the `console.error(req.headers.authorization, ...)` in `/feedback` that was
  logging bearer tokens. I also fixed the
  pagination off-by-one (`offset = page * PAGE_SIZE` →
  `(page - 1) * PAGE_SIZE`) that was skipping the first page of results —
  it wasn't a security bug but it blocked search verification.
- Why: String interpolation of user input into SQL is the textbook
  injection vector. The `status` and `q` params on `/feedback` and
  `/export.csv`, the `from`/`to` on `/metrics`, and all three fields on the
  assignment update were directly exploitable — an attacker could read any
  table (users/passwords) or mutate any row. The assignment route was
  especially bad: `assignee_id = ${assignee_id || 'NULL'}` let you write
  arbitrary SQL into the UPDATE. CSV formula injection is also a concern:
  a malicious feedback message starting with `=` executes as a
  formula when a support agent opens the export in Excel, enabling
  data exfiltration via `=HYPERLINK`.


### Verify JWTs (auth: `jwt.decode` → `jwt.verify`)
- What: `server/src/auth.ts` now verifies token signatures with
  `jwt.verify` against `process.env.JWT_SECRET`. Added a typed `verifyToken` helper
  used by both the `authenticate` middleware and the CSV export path, so
  there is exactly one place that decides what a valid token is. Removed the
  query-string token acceptance on `/export.csv` (tokens were leaking into
  URLs/logs/history). Frontend CSV export now fetches with an Authorization
  header and triggers a blob download. Also removed the
  `console.error(header, err)` that was logging bearer tokens.
- Why: `jwt.decode` only decodes the payload — it never checks the signature,
  so anyone could forge a token with any payload and authenticate as any
  user. This was the single most severe bug and the cleanest "agent got it
  subtly wrong" example: the code looked like it did auth, called a jwt
  function, and passed every happy-path test, but provided zero security.
  The query-string token on the export endpoint was a secondary leak of the
  same credential.


### Correctness + foundation pass
- What: A batch of fixes across the server and frontend:
  1. **Filtered total count** — `SELECT COUNT(*)` now uses the `WHERE` clause to filter the count, so the page count is correct when filtering/searching.
  2. **Feedback status resolve** — `/feedback/:id/resolve` now accepts a
    `status` in the body and sets it directly instead of toggling. The
    frontend sends the target status. 
  3. **Polling stale closure** — the 45s interval now depends on
    `[page, filter, debouncedSearch, token]` and reads from a ref
    (`latestItems`) instead of capturing a stale `items` closure.
  4. **`/summarize` robustness** — returns 404 for unknown feedback id
    (was crashing on `row.message` of undefined), 400 for missing id,
    and the LLM wrapper now checks `response.ok`, validates the response
    shape, and throws on missing `OPENAI_API_KEY`.
  5. **Assignment validation** — validates `assignee_id` is an integer,
    defaults `priority` to `'normal'`, writes `null` for empty `due_at`
    instead of the literal string `'undefined'`.
  6. **Input validation everywhere** — `/login` validates email/password
    presence and type, notes POST validates non-empty body, all routes
    with user input return 400 on invalid input instead of reaching the
    DB.
  7. **Debounced search** — 250ms debounce in `Inbox.tsx` instead of a
    request per keystroke.
  8. **Loading + error states** — `Inbox` and `ItemDetail` now show
    loading states, empty states, and surface errors to the user
    instead of silently swallowing them (`catch (e) {}` is gone).
    `api.ts` has a shared `apiError` helper that throws on non-OK
    responses.
  9. **N+1 fix** — `serializeFeedback` no longer does 2 extra queries
    per row. Replaced with a shared `FEEDBACK_SELECT` JOIN constant
    used by `/feedback`, `/feedback/:id`, `/customers/:id`.
  10. **Error middleware** — added a catch-all Express error handler.
  11. **UI copy cleanup** — removed the marquee banner, emoji-laden
    headers, and joke placeholders. 
  12. **Tests** — added 28 API tests with vitest + supertest covering
    auth (forged/alg:none/missing tokens, login validation), SQL
    injection regression, pagination (filtered totals, no overlap),
    idempotent resolve, summarize 404/400, assignment validation, notes
    validation, and CSV formula injection escaping. Added `npm test`
    script to root + server.
- Why: These are the issues that would cause a real user to lose trust
  or a real support agent to lose work — wrong page counts, silently
  flipped statuses, crashed summarize calls, a request per keystroke.
  The N+1 fix and error middleware are foundation: they don't fix a bug
  today but they make the next feature cheaper to build safely. Tests
  lock in the security fixes so a future agent can't regress them
  without a red light.


### Server architecture: split into route modules + middleware/services
- What: Split the 380-line `server/src/index.ts` into a layered structure:
  ```
  server/src/
    index.ts           
    db.ts               
    seed.ts             # DB schema + seed data (script)
    middleware/
      auth.ts           # JWT verification, authenticate middleware
    services/
      llm.ts            # LLM wrapper (OpenAI / fake)
    lib/
      feedback.ts       # Shared FEEDBACK_SELECT + serializeFeedback
    routes/
      auth.ts           # POST /login
      feedback.ts       # feedback CRUD, resolve, assignment, notes
      customers.ts      # customer detail + history
      dashboard.ts      # users, metrics, export, summarize
  ```
  Each route file exports an Express Router; `index.ts` mounts them.
  `auth.ts` moved to `middleware/` (it's request middleware, not app
  logic). `llm.ts` moved to `services/` (it's an external integration,
  not domain logic). Shared query constant + serializer in `lib/feedback.ts`.



### Professional CSS rewrite
- What: Replaced the entire `styles.css` — removed the rainbow animated
  background, Comic Sans font, wiggling buttons, blinking badges, custom
  emoji cursors, and `transform: rotate()` on every element. Replaced
  with a simple neutral design. 
- Why: A client would not take the app seriously with a joke UI. The
  old CSS was visually hostile and actively interfered with usability

## What I chose NOT to touch (and why)

- **httpOnly cookies / refresh tokens** — would require server-side
  cookie handling + CSRF protection, a meaningful refactor of the auth
  flow. Token-in-localStorage is imperfect (XSS-vulnerable) but
  functional. Documented in KNOWN-ISSUES.
- **Rate limiting on /login** — needs a store (in-memory or Redis) and
  tuning of thresholds. Not a 10-minute fix. Documented.
- **DB migrations framework** — the seed-owns-schema pattern works for a
  demo. Adding migrations is valuable but adds tooling complexity.
  Documented.
- **React Router** — the conditional-rendering navigation works for an
  internal tool. Adding a router is a frontend refactor with no
  user-visible benefit in the time budget. Documented.
- **Custom hooks (useInbox, useItemDetail)** — would clean up the
  components but is a logic refactor, not a mechanical move. Documented.
- **SSE/WebSocket for real-time updates** — the right architecture for a
  real inbox, but a significant addition (new endpoint, event
  infrastructure, client EventSource). Documented.
- **Frontend tests** — API tests cover the security and correctness
  regressions. Frontend tests would cover rendering and interaction but
  need a different setup (jsdom, testing-library). Documented.
- **Docker / deployment config** — out of scope



## Where the agent helped vs. where I overruled it

### Where the agent helped
- **SQL parameterization and CSV escaping** — the agent correctly converted
  all interpolated queries to `?` placeholders and added the formula
  injection prefix. This was mechanical work it did well and fast.
- **bcrypt integration** — adding the dependency, hashing in seed,
  `compareSync` in login. Straightforward, done correctly.
- **CSS rewrite** — the agent produced a clean, professional stylesheet in
  one pass. I specified the design language (system fonts, neutral
  background, indigo accent) and it executed.
- **Test scaffolding** — the agent wrote the 28 vitest + supertest tests,
  including the SQL injection regression tests and the idempotent resolve
  tests. I only had to fix one assertion (pagination ordering with
  identical timestamps).

### Where I overruled the agent or caught what it missed
- **`jwt.decode` vs `jwt.verify`** — the agent did not flag this. The code
  looked correct (it called a jwt function, it had a try/catch, it
  returned 401 on failure) and passed every happy-path test. I caught it
  by reading `auth.ts` carefully.
- **The flashy rainbow UI** — the agent never flagged the CSS as a
  problem. It treated the Comic Sans font, animated rainbow background,
  wiggling buttons, and emoji cursors as "existing style" rather than a
  client-repellent joke. I had to explicitly say "this is not fit for a
  paying client, rewrite it" and specify the design direction. The agent
  followed instructions well once told, but it did not independently
  recognize that a professional tool should look professional.
- **Server architecture** — the agent was content to leave all routes in
  a single 380-line `index.ts`. It did not flag the file size or lack of
  structure as a problem.
- **Polling vs server-push** — when fixing the stale closure in the 45s
  polling, the agent fixed the closure bug but
  did not question whether polling was the right approach at all. I
  recognized that a real-time inbox should be event-driven (SSE or
  WebSocket) rather than polling, and documented this in KNOWN-ISSUES
  rather than implementing it 
- **The `catch (e) {}` pattern** — the agent's initial code (the original
  codebase it produced) silently swallowed errors everywhere. When I
  asked it to add error states, it added them, but it did not
  independently recognize that swallowing errors was wrong. I had to
  explicitly say "stop swallowing errors, surface them to the user."

