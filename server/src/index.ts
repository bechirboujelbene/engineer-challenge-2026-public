import 'dotenv/config'
import express, { Request, Response } from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import { db } from './db'
import { JWT_SECRET, authenticate } from './auth'
import { summarizeText } from './llm'

const app = express()
app.use(cors())
app.use(express.json())

const PAGE_SIZE = 10

function serializeFeedback(row: any) {
  const customer: any = db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customer_id)
  const assignee: any = row.assignee_id
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(row.assignee_id)
    : null

  return {
    id: row.id,
    customer_id: row.customer_id,
    customer_name: customer.name,
    customer_email: customer.email,
    channel: row.channel,
    message: row.message,
    status: row.status,
    priority: row.priority,
    assignee_id: row.assignee_id,
    assignee_name: assignee?.name || null,
    due_at: row.due_at,
    created_at: row.created_at,
  }
}

function getExportUser(req: Request, res: Response) {
  const header = req.headers.authorization || ''
  const tokenFromHeader = header.startsWith('Bearer ') ? header.slice(7) : header
  const token = tokenFromHeader || (req.query.token as string)

  if (!token) {
    res.status(401).json({ error: 'Missing token' })
    return null
  }

  const payload = jwt.decode(token)
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' })
    return null
  }

  return payload
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

app.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body
  const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email)

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
})

app.get('/feedback', authenticate, (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'all'
    const search = ((req.query.q as string) || '').trim()
    const page = parseInt((req.query.page as string) || '1', 10)
    const offset = page * PAGE_SIZE

    const filters = []
    if (status !== 'all') {
      filters.push(`status = '${status}'`)
    }
    if (search) {
      filters.push(
        `(message LIKE '%${search}%' OR customer_id IN (SELECT id FROM customers WHERE name LIKE '%${search}%' OR email LIKE '%${search}%'))`
      )
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

    const rows: any[] = db
      .prepare(
        `SELECT * FROM feedback ${where} ORDER BY created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`
      )
      .all()

    const items = rows.map(serializeFeedback)

    const total: any = db.prepare('SELECT COUNT(*) as count FROM feedback').get()
    res.json({ items, total: total.count, page })
  } catch (err) {
    console.error(req.headers.authorization, err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

app.get('/users', authenticate, (req: Request, res: Response) => {
  const users = db.prepare('SELECT * FROM users ORDER BY name').all()
  res.json({ users })
})

app.get('/metrics', authenticate, (req: Request, res: Response) => {
  const from = (req.query.from as string) || '1970-01-01T00:00:00.000Z'
  const to = (req.query.to as string) || new Date().toISOString()
  const rows: any[] = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM feedback WHERE created_at >= '${from}' AND created_at <= '${to}' GROUP BY status`
    )
    .all()
  const urgent: any = db
    .prepare(`SELECT COUNT(*) as count FROM feedback WHERE priority = 'urgent' AND created_at >= '${from}'`)
    .get()
  const overdue: any = db
    .prepare(
      `SELECT COUNT(*) as count FROM feedback WHERE status = 'open' AND due_at < '${new Date().toISOString()}'`
    )
    .get()

  res.json({
    open: rows.find((row) => row.status === 'open')?.count || 0,
    resolved: rows.find((row) => row.status === 'resolved')?.count || 0,
    urgent: urgent.count,
    overdue: overdue.count,
  })
})

app.get('/export.csv', (req: Request, res: Response) => {
  const user = getExportUser(req, res)
  if (!user) return

  const status = (req.query.status as string) || 'all'
  const search = ((req.query.q as string) || '').trim()
  const filters = []
  if (status !== 'all') {
    filters.push(`f.status = '${status}'`)
  }
  if (search) {
    filters.push(`(f.message LIKE '%${search}%' OR c.name LIKE '%${search}%' OR c.email LIKE '%${search}%')`)
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

  const rows: any[] = db
    .prepare(
      `SELECT f.*, c.name as customer_name, c.email as customer_email, c.plan, u.name as assignee_name,
        (SELECT GROUP_CONCAT(body, ' | ') FROM feedback_notes WHERE feedback_id = f.id) as internal_notes
       FROM feedback f
       JOIN customers c ON c.id = f.customer_id
       LEFT JOIN users u ON u.id = f.assignee_id
       ${where}
       ORDER BY f.created_at DESC`
    )
    .all()

  const header = [
    'id',
    'customer',
    'email',
    'plan',
    'channel',
    'priority',
    'status',
    'assignee',
    'due_at',
    'message',
    'internal_notes',
  ]
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.id,
        row.customer_name,
        row.customer_email,
        row.plan,
        row.channel,
        row.priority,
        row.status,
        row.assignee_name,
        row.due_at,
        row.message,
        row.internal_notes,
      ]
        .map(csvCell)
        .join(',')
    ),
  ]

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="pulse-feedback-export.csv"')
  res.send(lines.join('\n'))
})

app.get('/customers/:id', authenticate, (req: Request, res: Response) => {
  const customer: any = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id)
  if (!customer) {
    return res.status(404).json({ error: 'Not found' })
  }

  const history: any[] = db
    .prepare('SELECT * FROM feedback WHERE customer_id = ? ORDER BY created_at DESC LIMIT 8')
    .all(req.params.id)

  res.json({
    ...customer,
    history: history.map(serializeFeedback),
  })
})

app.get('/feedback/:id', authenticate, (req: Request, res: Response) => {
  try {
    const row: any = db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id)
    if (!row) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.json(serializeFeedback(row))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

app.post('/feedback/:id/assignment', authenticate, (req: Request, res: Response) => {
  try {
    const { assignee_id, priority, due_at } = req.body
    db.prepare(
      `UPDATE feedback SET assignee_id = ${assignee_id || 'NULL'}, priority = '${priority}', due_at = '${due_at}' WHERE id = ${req.params.id}`
    ).run()

    const row: any = db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id)
    if (!row) {
      return res.status(404).json({ error: 'Not found' })
    }

    res.json(serializeFeedback(row))
  } catch (err) {
    console.error(req.body, err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

app.get('/feedback/:id/notes', authenticate, (req: Request, res: Response) => {
  const notes = db
    .prepare(
      `SELECT n.*, u.name as author_name, u.email as author_email
       FROM feedback_notes n
       LEFT JOIN users u ON u.id = n.author_id
       WHERE n.feedback_id = ${req.params.id}
       ORDER BY n.created_at DESC`
    )
    .all()
  res.json({ notes })
})

app.post('/feedback/:id/notes', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const createdAt = new Date().toISOString()
    db.prepare(
      'INSERT INTO feedback_notes (feedback_id, author_id, body, is_private, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, user.id, req.body.body, req.body.is_private ? 1 : 0, createdAt)

    const note: any = db
      .prepare(
        `SELECT n.*, u.name as author_name, u.email as author_email
         FROM feedback_notes n
         LEFT JOIN users u ON u.id = n.author_id
         WHERE n.id = last_insert_rowid()`
      )
      .get()

    res.status(201).json(note)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

app.post('/feedback/:id/resolve', authenticate, (req: Request, res: Response) => {
  try {
    const row: any = db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id)
    if (!row) {
      return res.status(404).json({ error: 'Not found' })
    }
    const nextStatus = row.status === 'open' ? 'resolved' : 'open'
    db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(nextStatus, req.params.id)
    res.json({ ...row, status: nextStatus })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

app.post('/summarize', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    const row: any = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id)
    const prompt = `Summarize the following customer feedback in one or two short sentences for a support agent.\n\n${row.message}`
    const summary = await summarizeText(prompt)
    res.json({ summary })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Pulse API running on http://localhost:${PORT}`)
})
