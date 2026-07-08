# AGENTS.md — Working rules for AI agents on Pulse

Pulse is a customer-feedback inbox: Express + TypeScript + better-sqlite3 API in
`server/`, React 18 + Vite SPA in `web/`, npm workspaces at the root.

## Commands

- `npm install` — installs both workspaces
- `npm run seed` — recreates and seeds `server/pulse.db` (destructive)
- `npm run dev` — runs API (http://localhost:4000) and web (http://localhost:5173)
- `npm run build` — typechecks and builds the web app
- Server typecheck: `npm run build --workspace server`

Test login: `alice@pulse.test` / `password123`

## Context: this codebase is being hardened

This app was AI-generated in a hurry and is being made production-ready. Treat it
as untrusted: verify claims against the code, do not assume the existing patterns
are correct. Known problem areas include auth, SQL construction, HTML rendering,
and pagination.

## Hard rules

- **SQL:** Always use parameterized queries (`?` placeholders with better-sqlite3
  `prepare(...).run/get/all(params)`). NEVER interpolate request values, query
  params, or any variable into SQL strings.
- **Auth:** Tokens must be verified with `jwt.verify` against the secret from
  `process.env.JWT_SECRET`. Never use `jwt.decode` for authentication. Never
  accept tokens via query string.
- **Rendering:** Never use `dangerouslySetInnerHTML`. Render user content as text.
- **Secrets:** Never log tokens, passwords, or API keys. Never send API keys to
  the browser (`VITE_*` vars are public). Never `SELECT *` from tables containing
  credentials in API responses — use explicit column lists.
- **Validation:** Validate and coerce all request input (body, params, query) at
  the route boundary before it touches the DB.
- **Errors:** Return proper status codes (400/401/404). Don't swallow errors with
  empty catch blocks. Don't leak internals in error responses.
- **Dependencies:** Check package.json before assuming a library exists. Ask
  before adding new dependencies.

## Style

- Match the existing style: no semicolons, single quotes, 2-space indent.
- TypeScript: avoid introducing new `any`; type API payloads via `web/src/types.ts`.
- Keep changes minimal and focused — do not reformat or refactor code unrelated
  to the task at hand.
- Do not add comments explaining what changed; code should stand on its own.

## Verification before claiming done

- `npm run build --workspace server` and `npm run build --workspace web` pass
- If tests exist (`server/test` or `*.test.ts`), run them
- For behavior changes, exercise the endpoint with `curl` or the UI

## Deliverable hygiene

- Update `DECISIONS.md` when a significant choice is made
- Track remaining problems in `KNOWN-ISSUES.md` instead of drive-by fixing
  out-of-scope code
