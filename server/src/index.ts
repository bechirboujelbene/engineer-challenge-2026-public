import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import authRoutes from './routes/auth'
import feedbackRoutes from './routes/feedback'
import customersRoutes from './routes/customers'
import dashboardRoutes from './routes/dashboard'

const app = express()
app.use(cors())
app.use(express.json())

app.use('/', authRoutes)
app.use('/feedback', feedbackRoutes)
app.use('/customers', customersRoutes)
app.use('/', dashboardRoutes)

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong' })
})

export { app }

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const PORT = process.env.PORT || 4000
  app.listen(PORT, () => {
    console.log(`Pulse API running on http://localhost:${PORT}`)
  })
}
