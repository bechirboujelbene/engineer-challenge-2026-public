import { Router, Request, Response } from 'express'
import { db } from '../db'
import { authenticate, verifyToken } from '../middleware/auth'
import { summarizeText } from '../services/llm'

const router = Router()

router.get('/users', authenticate, (req: Request, res: Response) => {
  const users = db.prepare('SELECT id, email, name, role FROM users ORDER BY name').all()
  res.json({ users })
})

router.get('/metrics', authenticate, (req: Request, res: Response) => {
  const from = (req.query.from as string) || '1970-01-01T00:00:00.000Z'
  const to = (req.query.to as string) || new Date().toISOString()
  const now = new Date().toISOString()
  const rows: any[] = db
    .prepare(
      'SELECT status, COUNT(*) as count FROM feedback WHERE created_at >= ? AND created_at <= ? GROUP BY status'
    )
    .all(from, to)
  const urgent: any = db
    .prepare(
      "SELECT COUNT(*) as count FROM feedback WHERE priority = 'urgent' AND created_at >= ?"
    )
    .get(from)
  const overdue: any = db
    .prepare(
      "SELECT COUNT(*) as count FROM feedback WHERE status = 'open' AND due_at < ?"
    )
    .get(now)

  res.json({
    open: rows.find((row) => row.status === 'open')?.count || 0,
    resolved: rows.find((row) => row.status === 'resolved')?.count || 0,
    urgent: urgent.count,
    overdue: overdue.count,
  })
})

router.post('/summarize', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id || typeof id !== 'number') {
      return res.status(400).json({ error: 'Feedback id is required' })
    }
    const row: any = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id)
    if (!row) {
      return res.status(404).json({ error: 'Feedback not found' })
    }
    const prompt = `Summarize the following customer feedback in one or two short sentences for a support agent.\n\n${row.message}`
    const summary = await summarizeText(prompt)
    res.json({ summary })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate summary' })
  }
})

function getExportUser(req: Request, res: Response) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : header

  if (!token) {
    res.status(401).json({ error: 'Missing token' })
    return null
  }

  const payload = verifyToken(token)
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' })
    return null
  }

  return payload
}

function csvCell(value: unknown) {
  let s = String(value ?? '')
  if (/^[=+\-@]/.test(s)) {
    s = `'${s}`
  }
  return `"${s.replace(/"/g, '""')}"`
}

router.get('/export.csv', (req: Request, res: Response) => {
  const user = getExportUser(req, res)
  if (!user) return

  const status = (req.query.status as string) || 'all'
  if (!['all', 'open', 'resolved'].includes(status)) {
    res.status(400).json({ error: 'Invalid status filter' })
    return
  }
  const search = ((req.query.q as string) || '').trim()
  const filters: string[] = []
  const params: string[] = []
  if (status !== 'all') {
    filters.push('f.status = ?')
    params.push(status)
  }
  if (search) {
    filters.push('(f.message LIKE ? OR c.name LIKE ? OR c.email LIKE ?)')
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
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
    .all(...params)

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

export default router
