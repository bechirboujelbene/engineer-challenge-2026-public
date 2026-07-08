import { Router, Request, Response } from 'express'
import { db } from '../db'
import { authenticate } from '../middleware/auth'
import { FEEDBACK_SELECT, serializeFeedback } from '../lib/feedback'

const router = Router()

router.get('/:id', authenticate, (req: Request, res: Response) => {
  const customer: any = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id)
  if (!customer) {
    return res.status(404).json({ error: 'Not found' })
  }

  const history: any[] = db
    .prepare(
      `${FEEDBACK_SELECT} WHERE f.customer_id = ? ORDER BY f.created_at DESC LIMIT 8`
    )
    .all(req.params.id)

  res.json({
    ...customer,
    history: history.map(serializeFeedback),
  })
})

export default router
