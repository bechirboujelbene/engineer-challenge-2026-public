import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { app } from '../src/index'
import { db } from '../src/db'

const JWT_SECRET = process.env.JWT_SECRET || 'pulse-dev-secret-2024'

function makeToken(payload: object = { id: 1, email: 'alice@pulse.test', name: 'Alice', role: 'agent' }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}

beforeAll(() => {
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

  const hashed = bcrypt.hashSync('password123', 10)
  db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run(
    'alice@pulse.test', hashed, 'Alice Martin', 'agent'
  )
  db.prepare('INSERT INTO customers (name, email, plan, health_score) VALUES (?, ?, ?, ?)').run(
    'Test Customer', 'test@example.com', 'Enterprise', 90
  )
  const baseTime = Date.now()
  for (let i = 0; i < 25; i++) {
    db.prepare(
      'INSERT INTO feedback (customer_id, channel, message, status, priority, assignee_id, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      1, 'email', `Feedback item ${i} about dashboard`,
      i % 10 < 3 ? 'resolved' : 'open',
      ['low', 'normal', 'high', 'urgent'][i % 4],
      1, null, new Date(baseTime - i * 1000).toISOString()
    )
  }
})

describe('Auth', () => {
  it('rejects forged tokens (jwt.verify not decode)', async () => {
    const forged = jwt.sign({ id: 1, email: 'x', name: 'x', role: 'agent' }, 'WRONG-SECRET')
    const res = await request(app).get('/feedback').set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(401)
  })

  it('rejects alg:none tokens', async () => {
    const unsigned = jwt.sign({ id: 1, email: 'x', name: 'x', role: 'agent' }, 'x', { algorithm: 'none' })
    const res = await request(app).get('/feedback').set('Authorization', `Bearer ${unsigned}`)
    expect(res.status).toBe(401)
  })

  it('rejects missing token', async () => {
    const res = await request(app).get('/feedback')
    expect(res.status).toBe(401)
  })

  it('accepts valid token', async () => {
    const res = await request(app).get('/feedback').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
  })

  it('login with correct password returns token', async () => {
    const res = await request(app).post('/login').send({ email: 'alice@pulse.test', password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.email).toBe('alice@pulse.test')
  })

  it('login with wrong password returns 401', async () => {
    const res = await request(app).post('/login').send({ email: 'alice@pulse.test', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('login with missing fields returns 400', async () => {
    const res = await request(app).post('/login').send({})
    expect(res.status).toBe(400)
  })

  it('/users does not return password column', async () => {
    const res = await request(app).get('/users').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.users[0]).not.toHaveProperty('password')
  })
})

describe('SQL injection (regression)', () => {
  it('rejects injection in status filter', async () => {
    const res = await request(app)
      .get('/feedback?status=open%27%20OR%20%271%27=%271')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
  })

  it('treats UNION injection in search as literal text', async () => {
    const res = await request(app)
      .get('/feedback?q=xyz%27%20UNION%20SELECT%20password%20FROM%20users--')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBe(0)
  })

  it('rejects invalid priority in assignment', async () => {
    const res = await request(app)
      .post('/feedback/1/assignment')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ assignee_id: null, priority: "high' OR '1'='1", due_at: null })
    expect(res.status).toBe(400)
  })
})

describe('Pagination', () => {
  it('page 1 returns first PAGE_SIZE items', async () => {
    const res = await request(app).get('/feedback?page=1').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBe(10)
    // Items are ordered by created_at DESC; item 0 has the newest timestamp
    expect(res.body.items[0].id).toBe(1)
  })

  it('page 2 returns next set (no overlap)', async () => {
    const p1 = await request(app).get('/feedback?page=1').set('Authorization', `Bearer ${makeToken()}`)
    const p2 = await request(app).get('/feedback?page=2').set('Authorization', `Bearer ${makeToken()}`)
    const p1Ids = p1.body.items.map((i: any) => i.id)
    const p2Ids = p2.body.items.map((i: any) => i.id)
    expect(p1Ids.some((id: number) => p2Ids.includes(id))).toBe(false)
  })

  it('total respects status filter', async () => {
    const all = await request(app).get('/feedback').set('Authorization', `Bearer ${makeToken()}`)
    const open = await request(app).get('/feedback?status=open').set('Authorization', `Bearer ${makeToken()}`)
    const resolved = await request(app).get('/feedback?status=resolved').set('Authorization', `Bearer ${makeToken()}`)
    expect(all.body.total).toBe(25)
    expect(open.body.total + resolved.body.total).toBe(all.body.total)
  })

  it('total respects search filter', async () => {
    const res = await request(app).get('/feedback?q=dashboard').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.body.total).toBe(25)
    const none = await request(app).get('/feedback?q=nonexistentterm').set('Authorization', `Bearer ${makeToken()}`)
    expect(none.body.total).toBe(0)
  })
})

describe('Resolve (idempotent)', () => {
  it('sets target status instead of toggling', async () => {
    const res = await request(app)
      .post('/feedback/1/resolve')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ status: 'resolved' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('resolved')
  })

  it('same status twice stays the same', async () => {
    await request(app).post('/feedback/2/resolve').set('Authorization', `Bearer ${makeToken()}`).send({ status: 'resolved' })
    const res = await request(app).post('/feedback/2/resolve').set('Authorization', `Bearer ${makeToken()}`).send({ status: 'resolved' })
    expect(res.body.status).toBe('resolved')
  })

  it('rejects invalid status', async () => {
    const res = await request(app).post('/feedback/1/resolve').set('Authorization', `Bearer ${makeToken()}`).send({ status: 'bogus' })
    expect(res.status).toBe(400)
  })
})

describe('Summarize', () => {
  it('returns 404 for unknown feedback id', async () => {
    const res = await request(app).post('/summarize').set('Authorization', `Bearer ${makeToken()}`).send({ id: 99999 })
    expect(res.status).toBe(404)
  })

  it('returns 400 for missing id', async () => {
    const res = await request(app).post('/summarize').set('Authorization', `Bearer ${makeToken()}`).send({})
    expect(res.status).toBe(400)
  })

  it('returns summary for valid id', async () => {
    const res = await request(app).post('/summarize').set('Authorization', `Bearer ${makeToken()}`).send({ id: 1 })
    expect(res.status).toBe(200)
    expect(res.body.summary).toBeTruthy()
  })
})

describe('Assignment', () => {
  it('handles null due_at without writing "undefined"', async () => {
    const res = await request(app)
      .post('/feedback/1/assignment')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ assignee_id: null, priority: 'high', due_at: null })
    expect(res.status).toBe(200)
    expect(res.body.due_at).toBeNull()
  })

  it('rejects non-integer assignee_id', async () => {
    const res = await request(app)
      .post('/feedback/1/assignment')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ assignee_id: 'abc', priority: 'high', due_at: null })
    expect(res.status).toBe(400)
  })
})

describe('Notes', () => {
  it('rejects empty note body', async () => {
    const res = await request(app)
      .post('/feedback/1/notes')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ body: '', is_private: true })
    expect(res.status).toBe(400)
  })

  it('creates a note with valid body', async () => {
    const res = await request(app)
      .post('/feedback/1/notes')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ body: 'Test note content', is_private: false })
    expect(res.status).toBe(201)
    expect(res.body.body).toBe('Test note content')
  })
})

describe('CSV export', () => {
  it('rejects query-string token (must use header)', async () => {
    const res = await request(app).get('/export.csv?token=fake')
    expect(res.status).toBe(401)
  })

  it('works with Authorization header', async () => {
    const res = await request(app).get('/export.csv').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
  })

  it('escapes CSV formula injection (=HYPERLINK)', async () => {
    db.prepare(
      'INSERT INTO feedback (customer_id, channel, message, status, priority, assignee_id, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(1, 'email', '=HYPERLINK("https://evil.test","click")', 'open', 'low', null, null, new Date().toISOString())

    const res = await request(app).get('/export.csv').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.text).toContain("'=HYPERLINK")
  })
})
