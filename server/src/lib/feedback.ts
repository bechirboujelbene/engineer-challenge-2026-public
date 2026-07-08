export const FEEDBACK_SELECT = `
  SELECT f.*, c.name as customer_name, c.email as customer_email, u.name as assignee_name
  FROM feedback f
  JOIN customers c ON c.id = f.customer_id
  LEFT JOIN users u ON u.id = f.assignee_id
`

export function serializeFeedback(row: any) {
  return {
    id: row.id,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    channel: row.channel,
    message: row.message,
    status: row.status,
    priority: row.priority,
    assignee_id: row.assignee_id,
    assignee_name: row.assignee_name || null,
    due_at: row.due_at,
    created_at: row.created_at,
  }
}
