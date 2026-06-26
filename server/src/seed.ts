import { db } from './db'

db.exec(`
  DROP TABLE IF EXISTS feedback_notes;
  DROP TABLE IF EXISTS feedback;
  DROP TABLE IF EXISTS customers;
  DROP TABLE IF EXISTS users;

  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL
  );

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    plan TEXT NOT NULL,
    health_score INTEGER NOT NULL
  );

  CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    assignee_id INTEGER,
    due_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE feedback_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    is_private INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`)

const users = [
  { email: 'alice@pulse.test', password: 'password123', name: 'Alice Martin', role: 'agent' },
  { email: 'ben@pulse.test', password: 'support42', name: 'Ben Carter', role: 'manager' },
  { email: 'chloe@pulse.test', password: 'welcome1', name: 'Chloe Nguyen', role: 'agent' },
]

const insertUser = db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)')
for (const u of users) {
  insertUser.run(u.email, u.password, u.name, u.role)
}

const customers = [
  { name: 'Olivia Bennett', email: 'olivia.bennett@example.com', plan: 'Enterprise', health_score: 91 },
  { name: 'Marcus Lee', email: 'marcus.lee@example.com', plan: 'Team', health_score: 67 },
  { name: 'Priya Sharma', email: 'priya.sharma@example.com', plan: 'Enterprise', health_score: 82 },
  { name: 'James Okafor', email: 'james.okafor@example.com', plan: 'Starter', health_score: 44 },
  { name: 'Sofia Rossi', email: 'sofia.rossi@example.com', plan: 'Team', health_score: 73 },
  { name: 'Liam Walsh', email: 'liam.walsh@example.com', plan: 'Enterprise', health_score: 56 },
  { name: 'Hannah Kim', email: 'hannah.kim@example.com', plan: 'Starter', health_score: 62 },
  { name: 'Diego Morales', email: 'diego.morales@example.com', plan: 'Team', health_score: 79 },
  { name: 'Emma Schmidt', email: 'emma.schmidt@example.com', plan: 'Enterprise', health_score: 88 },
  { name: 'Noah Andersson', email: 'noah.andersson@example.com', plan: 'Starter', health_score: 39 },
  { name: 'Aisha Khan', email: 'aisha.khan@example.com', plan: 'Team', health_score: 70 },
  { name: 'Lucas Martin', email: 'lucas.martin@example.com', plan: 'Enterprise', health_score: 94 },
  { name: 'Mia Nakamura', email: 'mia.nakamura@example.com', plan: 'Team', health_score: 75 },
  { name: 'Ethan Brooks', email: 'ethan.brooks@example.com', plan: 'Starter', health_score: 48 },
  { name: 'Zoe Dubois', email: 'zoe.dubois@example.com', plan: 'Enterprise', health_score: 86 },
]

const insertCustomer = db.prepare(
  'INSERT INTO customers (name, email, plan, health_score) VALUES (?, ?, ?, ?)'
)
for (const c of customers) {
  insertCustomer.run(c.name, c.email, c.plan, c.health_score)
}

const messages = [
  "I've been using the new dashboard for a week and it's a big improvement. The load times feel much faster than before.",
  "The export button on the reports page doesn't seem to do anything when I click it. I'm on the latest version of Chrome.",
  'Could you clarify how billing works when we add a new team member mid-cycle? We want to budget correctly.',
  'Thanks for the quick turnaround on my last ticket. The issue with the missing invoices is fully resolved now.',
  "The mobile app keeps logging me out every few hours. It's getting in the way of my daily check-ins.",
  'Is there a way to bulk-import contacts from a CSV file? I have about two thousand records to move over.',
  'Really happy with the recent update. The new filters make it much easier to find what I need.',
  "I was charged twice for this month's subscription. Could someone look into a refund for the duplicate?",
  "The search results sometimes feel out of date. I add an item and it doesn't show up until I refresh a few times.",
  'Your support team has been fantastic. Every question I have had was answered clearly and quickly.',
  "We'd love an option to schedule reports to be emailed automatically each Monday morning.",
  'The onboarding flow was smooth and the sample data helped me understand the product right away.',
  "I can't reset my password. The reset email never arrives, even after checking my spam folder.",
  'The new pricing page is much clearer than before. It made it easy to choose the right plan for our team.',
  'When I try to upload a profile photo larger than a few megabytes, the page hangs and nothing happens.',
  'Could you add a dark mode? I work late and the bright interface is hard on my eyes.',
  'The integration with our calendar tool stopped syncing yesterday. Events created today are not showing up.',
  'I appreciate how responsive the interface is. Everything feels snappy even with a lot of data loaded.',
  "There's a small typo on the settings page where it says 'Notifcations' instead of 'Notifications'.",
  'We need a way to assign feedback items to specific teammates so nothing falls through the cracks.',
  'The chat widget is great, but it would help to keep a history of past conversations in one place.',
  'After the latest update, the sidebar icons are a little hard to tell apart. Maybe add labels on hover?',
  'Everything has been working well for our team. Just wanted to say thanks for a reliable product.',
  'The date picker defaults to the wrong time zone for me, so my scheduled posts go out an hour early.',
  "Is there documentation on the API rate limits? We're building an internal tool and want to stay within them.",
  'The page that lists archived items loads very slowly once you have more than a few hundred entries.',
  "I'd like to merge two duplicate customer records, but I can't find an option to do that anywhere.",
  "Loving the new keyboard shortcuts. They've genuinely sped up how I work through my inbox each morning.",
  "The notification badge sometimes shows unread items even after I've read everything. A small but persistent annoyance.",
  'Could we get a weekly summary email of new feedback? It would help managers stay in the loop without logging in.',
  '=HYPERLINK("https://example.invalid/refund","Please review my duplicate charge")',
  '<strong>Heads up:</strong> the last agent told me this would be escalated today.',
]

const channels = ['email', 'chat', 'app store']
const priorities = ['low', 'normal', 'high', 'urgent']

const insertFeedback = db.prepare(
  'INSERT INTO feedback (customer_id, channel, message, status, priority, assignee_id, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
)

const now = Date.now()
const hour = 60 * 60 * 1000
const day = 24 * hour

for (let i = 0; i < 80; i++) {
  const customerId = (i % customers.length) + 1
  const channel = channels[i % channels.length]
  const message = messages[i % messages.length]
  const status = i % 10 < 3 ? 'resolved' : 'open'
  const priority = priorities[i % priorities.length]
  const assigneeId = (i % users.length) + 1
  const dueAt = new Date(now + ((i % 9) - 3) * day).toISOString()
  const createdAt = new Date(now - i * 18 * hour - (i % 7) * hour).toISOString()
  insertFeedback.run(customerId, channel, message, status, priority, assigneeId, dueAt, createdAt)
}

const notes = [
  {
    feedback_id: 1,
    author_id: 2,
    body: 'VIP account. Please offer a credit if they ask again.',
    is_private: 1,
  },
  {
    feedback_id: 2,
    author_id: 1,
    body: 'Reproduced in Chrome. Export button gets stuck after click.',
    is_private: 0,
  },
  {
    feedback_id: 5,
    author_id: 3,
    body: '<em>Customer sounded frustrated.</em> Follow up before end of day.',
    is_private: 1,
  },
  {
    feedback_id: 8,
    author_id: 2,
    body: 'Billing issue: possible duplicate payment. Do not promise refund amount yet.',
    is_private: 1,
  },
]

const insertNote = db.prepare(
  'INSERT INTO feedback_notes (feedback_id, author_id, body, is_private, created_at) VALUES (?, ?, ?, ?, ?)'
)
for (let i = 0; i < notes.length; i++) {
  const note = notes[i]
  insertNote.run(
    note.feedback_id,
    note.author_id,
    note.body,
    note.is_private,
    new Date(now - (i + 1) * 3 * hour).toISOString()
  )
}

console.log(
  `Seeded ${users.length} users, ${customers.length} customers, 80 feedback items, and ${notes.length} notes.`
)
