export type FeedbackItem = {
  id: number
  customer_id: number
  customer_name: string
  customer_email: string
  channel: string
  message: string
  status: 'open' | 'resolved'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  assignee_id: number | null
  assignee_name: string | null
  due_at: string | null
  created_at: string
}

export type User = {
  id: number
  email: string
  name: string
  role: string
}

export type InternalNote = {
  id: number
  feedback_id: number
  author_id: number
  author_name: string
  author_email: string
  body: string
  is_private: 0 | 1
  created_at: string
}

export type CustomerProfile = {
  id: number
  name: string
  email: string
  plan: string
  health_score: number
  history: FeedbackItem[]
}

export type Metrics = {
  open: number
  resolved: number
  urgent: number
  overdue: number
}
