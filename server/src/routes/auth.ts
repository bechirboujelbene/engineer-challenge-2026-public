import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from '../db'
import { JWT_SECRET } from '../middleware/auth'

const router = Router()

router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email)

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
})

export default router
