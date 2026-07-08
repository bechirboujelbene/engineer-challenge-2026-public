# KNOWN-ISSUES

What is still broken, missing, or deliberately left alone, and what I would
do with another day or a longer engagement.

## Security

### Token stored in localStorage (XSS-vulnerable)
The JWT is stored in `localStorage` and sent as a Bearer header on every
request. Any script running on the page can read `localStorage.getItem('token')` and
exfiltrate the token. The more secure alternative is **httpOnly cookies**
set by the server: JavaScript cannot read them, so an XSS attack cannot
steal the session. This would require server-side changes (setting cookies
on `/login`, reading cookies in `authenticate`, clearing cookies on logout)
and CSRF protection (SameSite=Strict or a CSRF token).

**With another day:** Switch to httpOnly cookies + CSRF protection.

### No rate limiting on /login
There is no lockout on the login endpoint. An attacker can
brute-force passwords at network speed. The bcrypt hashing slows each
attempt (~100ms at cost 10) but that is not a substitute for rate limiting.



### CORS wide open
`app.use(cors())` allows any origin to make authenticated requests. For an
internal tool this should be restricted to the known frontend origin.


### No refresh token mechanism
Tokens expire in 7 days with no refresh flow. A user whose token expires
gets silently logged out on the next API call with no friendly message.

**With another day:** Implement short-lived access tokens (15 min) + refresh
tokens via httpOnly cookie, with a `/refresh` endpoint.


## Architecture

### Route granularity could be finer
The server is split into 4 route modules by domain (auth, feedback,
customers, dashboard). `dashboard.ts` currently bundles `/users`,
`/metrics`, `/summarize`, and `/export.csv` — these are distinct
features that could each be their own file if the app grows. Similarly,
`feedback.ts` bundles list, detail, resolve, assignment, and notes.

**With another day:** Split `dashboard.ts` into `users.ts`, `metrics.ts`,
`summarize.ts`, `export.ts` once they start accumulating logic. Keep
`feedback.ts` as one file until notes or assignment grow complex enough
to warrant extraction. Also move the error handler from `index.ts` into
`middleware/error.ts` once there is more than one middleware.

### No DB migrations framework
The schema lives entirely in `seed.ts`, which drops and recreates all
tables. This works for a demo but means any schema change requires a full
data wipe. There is no way to evolve the schema while preserving data.

**With another day:** Add a lightweight migration system (e.g. a
`migrations/` folder with numbered SQL files, a `migrate` script that
tracks applied migrations in a `_migrations` table).

### No DB indexes
The `feedback` table has no indexes beyond the primary key. With real data
volume, queries filtering by `status`, `customer_id`, `assignee_id`, or
`created_at` will do full table scans.

### Frontend has no router
The app uses conditional rendering (`if (selectedId) return <ItemDetail>`)
instead of a real router. This means no back-button support, no deep
linking, and no URL-based state. For an internal tool this is tolerable
but fragile.

**With another day:** Add `react-router-dom` with routes like
`/inbox`, `/feedback/:id`, `/login`.

### Prop drilling for token
Every component receives `token` as a prop and passes it to every API
call. This is repetitive and error-prone — a single missing prop causes a
silent 401.

**With another day:** Wrap the app in an `AuthContext` that provides the
token; the `api.ts` functions read from context or an interceptor sets
the header automatically.

### Frontend components mix data logic with rendering
`Inbox.tsx` (241 lines) and `ItemDetail.tsx` (287 lines) both inline
data-fetching, state management, polling, and rendering. This makes the
components hard to test and reuse. `api.ts` (163 lines) is appropriately
sized — all functions follow the same shape and fit on one screen — but
the components would benefit from extracting custom hooks.

**With another day:** Extract `hooks/useInbox.ts` (pagination, search,
debounce, polling, resolve) and `hooks/useItemDetail.ts` (loading,
assignment, notes, summarize) so the components are purely presentational.
This also makes the data logic testable without rendering.

## UI / UX

No ARIA labels, no keyboard navigation testing, no focus management on
route changes, no screen reader testing. The table rows are clickable
divs with no `role` or `tabindex`. 

**With another day:** Add ARIA labels to interactive elements, make table
rows keyboard-navigable, test with a screen reader, verify color contrast.

### No toast/notification system
Errors are shown inline in the component, which is fine for forms but
awkward for background failures. A toast system would give consistent error surfacing.

**With another day:** Add a lightweight toast library or a context-based
notification system.

### Metrics panel never refreshes
The metrics strip is fetched once on mount (`useEffect([token])`) and
never again. If an agent resolves 5 items, the "Open" count doesn't
update until they refresh the page.

**With another day:** Refetch metrics when items change, or poll on the
same interval as the inbox.

### Polling instead of server-push
The inbox refreshes via a 45-second polling interval — every 45s the
client re-fetches the full page of items and merges them. This is
wasteful (most polls return unchanged data) and laggy (an agent may wait
45s to see a new item). The correct approach for a real-time inbox is
server-push via Server-Sent Events (SSE) or WebSocket — the server
notifies the client only when something changes, eliminating both the
waste and the lag. SSE is the simpler fit for this app (one-way
server→client, no need for bidirectional communication, works over plain
HTTP, no additional protocol upgrade).

**With another day:** Add an SSE endpoint (`GET /events`) that streams
feedback changes (new item, status change, assignment change) to
connected clients. Replace the polling `useEffect` with an
`EventSource` subscription. This would also fix the metrics refresh
issue — the same event stream can carry metric updates.



### No empty state for customer history
If a customer has no feedback history, the "Recent history" section
shows an empty `<ul>` with no message. A "No previous feedback" message
would be friendlier.


## Testing

### No frontend tests

components have no tests — no rendering tests, no interaction tests, no
regression tests for the debounce or polling logic.


### No e2e tests
No end-to-end tests (e.g. Playwright/Cypress) that verify the full
login → inbox → detail → resolve flow through a real browser.

**With another day:** Add a small Playwright suite covering the critical
path.

### Test DB is the same as dev DB
Tests run against the same `pulse.db` file as the dev server. The test
setup drops and recreates tables, which would destroy dev data if run
while the server is running. Tests should use a separate DB file
(e.g. `pulse.test.db`).


