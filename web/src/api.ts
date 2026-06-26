import { API_URL, LLM_API_KEY } from './config'
import { CustomerProfile, FeedbackItem, InternalNote, Metrics, User } from './types'

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error('Login failed')
  }
  return res.json()
}

export async function fetchInbox(
  page: number,
  status: string,
  search: string,
  token: string
): Promise<{ items: FeedbackItem[]; total: number; page: number }> {
  const res = await fetch(`${API_URL}/feedback?page=${page}&status=${status}&q=${search}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export async function fetchItem(id: number, token: string): Promise<FeedbackItem> {
  const res = await fetch(`${API_URL}/feedback/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export async function toggleResolve(id: number, token: string): Promise<FeedbackItem> {
  const res = await fetch(`${API_URL}/feedback/${id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export async function fetchUsers(token: string): Promise<{ users: User[] }> {
  const res = await fetch(`${API_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export async function fetchMetrics(token: string): Promise<Metrics> {
  const res = await fetch(`${API_URL}/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export function exportFeedbackUrl(status: string, search: string, token: string) {
  return `${API_URL}/export.csv?status=${status}&q=${search}&token=${token}`
}

export async function fetchCustomer(id: number, token: string): Promise<CustomerProfile> {
  const res = await fetch(`${API_URL}/customers/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export async function updateAssignment(
  id: number,
  data: { assignee_id: number | null; priority: string; due_at: string },
  token: string
): Promise<FeedbackItem> {
  const res = await fetch(`${API_URL}/feedback/${id}/assignment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function fetchNotes(id: number, token: string): Promise<{ notes: InternalNote[] }> {
  const res = await fetch(`${API_URL}/feedback/${id}/notes`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export async function addNote(
  id: number,
  data: { body: string; is_private: boolean },
  token: string
): Promise<InternalNote> {
  const res = await fetch(`${API_URL}/feedback/${id}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function summarize(id: number, token: string): Promise<{ summary: string }> {
  const res = await fetch(`${API_URL}/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-llm-key': LLM_API_KEY,
    },
    body: JSON.stringify({ id }),
  })
  return res.json()
}
