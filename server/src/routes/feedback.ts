import { Router, Request, Response } from 'express'
import { db } from '../db'
import { authenticate } from '../middleware/auth'
import { FEEDBACK_SELECT, serializeFeedback } from '../lib/feedback'

const router = Router()
const PAGE_SIZE = 10
const VALID_STATUSES = ['all', 'open', 'resolved']
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent']

router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'all'
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' })
    }
    const search = ((req.query.q as string) || '').trim()
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE

    const where: string[] = []
    const params: (string | number)[] = []
    if (status !== 'all') {
      where.push('f.status = ?')
      params.push(status)
    }
    if (search) {
      where.push('(f.message LIKE ? OR c.name LIKE ? OR c.email LIKE ?)')
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const rows: any[] = db
      .prepare(
        `${FEEDBACK_SELECT} ${whereClause} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, PAGE_SIZE, offset)

    const items = rows.map(serializeFeedback)

    const total: any = db
      .prepare(
        `SELECT COUNT(*) as count FROM feedback f JOIN customers c ON c.id = f.customer_id ${whereClause}`
      )
      .get(...params)
    res.json({ items, total: total.count, page })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

router.get('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const row: any = db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(req.params.id)
    if (!row) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.json(serializeFeedback(row))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

router.post('/:id/assignment', authenticate, (req: Request, res: Response) => {
  try {
    const { assignee_id, priority, due_at } = req.body
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' })
    }
    if (assignee_id !== null && assignee_id !== undefined) {
      const numId = Number(assignee_id)
      if (isNaN(numId) || !Number.isInteger(numId)) {
        return res.status(400).json({ error: 'Invalid assignee_id' })
      }
    }
    db.prepare(
      'UPDATE feedback SET assignee_id = ?, priority = ?, due_at = ? WHERE id = ?'
    ).run(assignee_id ?? null, priority ?? 'normal', due_at || null, req.params.id)

    const row: any = db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(req.params.id)
    if (!row) {
      return res.status(404).json({ error: 'Not found' })
    }

    res.json(serializeFeedback(row))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

router.get('/:id/notes', authenticate, (req: Request, res: Response) => {
  const notes = db
    .prepare(
      `SELECT n.*, u.name as author_name, u.email as author_email
       FROM feedback_notes n
       LEFT JOIN users u ON u.id = n.author_id
       WHERE n.feedback_id = ?
       ORDER BY n.created_at DESC`
    )
    .all(req.params.id)
  res.json({ notes })
})

router.post('/:id/notes', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { body, is_private } = req.body
    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'Note body is required' })
    }
    const createdAt = new Date().toISOString()
    db.prepare(
      'INSERT INTO feedback_notes (feedback_id, author_id, body, is_private, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, user.id, body, is_private ? 1 : 0, createdAt)

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

router.post('/:id/resolve', authenticate, (req: Request, res: Response) => {
  try {
    const row: any = db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id)
    if (!row) {
      return res.status(404).json({ error: 'Not found' })
    }
    const targetStatus = (req.body && req.body.status) || (row.status === 'open' ? 'resolved' : 'open')
    if (!['open', 'resolved'].includes(targetStatus)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(targetStatus, req.params.id)
    res.json({ ...row, status: targetStatus })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

export default router
