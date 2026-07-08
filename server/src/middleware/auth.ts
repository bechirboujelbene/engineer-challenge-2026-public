import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET: string = process.env.JWT_SECRET || ''

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in the environment.')
}

export { JWT_SECRET }

export interface JwtPayload {
  id: number
  email: string
  name: string
  role: string
}

// Verifies a token's signature and expiration. Returns the payload or null.
// Used for both the Authorization-header middleware and the CSV export path
// so there is exactly one place that decides what a valid token is.
export function verifyToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as JwtPayload
    if (
      typeof payload.id !== 'number' ||
      typeof payload.email !== 'string' ||
      typeof payload.role !== 'string'
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : header

  if (!token) {
    return res.status(401).json({ error: 'Missing token' })
  }

  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  ;(req as any).user = payload
  next()
}
