import { useEffect, useState, useRef } from 'react'
import { downloadExport, fetchInbox, fetchMetrics, toggleResolve } from '../api'
import { FeedbackItem, Metrics } from '../types'
import ItemDetail from './ItemDetail'

const PAGE_SIZE = 10

export default function Inbox({ token }: { token: string }) {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState<number | null>(null)
  const latestItems = useRef<FeedbackItem[]>([])

  useEffect(() => {
    latestItems.current = items
  }, [items])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchInbox(page, filter, debouncedSearch, token)
      setItems(data.items)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || 'Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page, filter, debouncedSearch])

  useEffect(() => {
    fetchMetrics(token).then(setMetrics).catch(() => {})
  }, [token])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await fetchInbox(page, filter, debouncedSearch, token)
        const local = latestItems.current
        const merged = data.items.map((incoming) => {
          const localItem = local.find((it) => it.id === incoming.id)
          return localItem ? { ...incoming, status: localItem.status } : incoming
        })
        setItems(merged)
      } catch {}
    }, 45000)
    return () => clearInterval(interval)
  }, [page, filter, debouncedSearch, token])

  const onResolve = async (item: FeedbackItem) => {
    const nextStatus = item.status === 'open' ? 'resolved' : 'open'
    setResolving(item.id)
    try {
      setItems(
        latestItems.current.map((it) =>
          it.id === item.id ? { ...it, status: nextStatus } : it
        )
      )
      await toggleResolve(item.id, token, nextStatus)
    } catch (err: any) {
      setItems(
        latestItems.current.map((it) =>
          it.id === item.id ? { ...it, status: item.status } : it
        )
      )
      setError('Failed to update status')
    } finally {
      setResolving(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (selectedId !== null) {
    return (
      <ItemDetail
        id={selectedId}
        token={token}
        onBack={() => {
          setSelectedId(null)
          load()
        }}
      />
    )
  }

  return (
    <div className="inbox">
      {metrics && (
        <div className="metrics-strip">
          <div>
            <strong>{metrics.open}</strong>
            <span>Open</span>
          </div>
          <div>
            <strong>{metrics.resolved}</strong>
            <span>Resolved</span>
          </div>
          <div>
            <strong>{metrics.urgent}</strong>
            <span>Urgent</span>
          </div>
          <div>
            <strong>{metrics.overdue}</strong>
            <span>Overdue</span>
          </div>
        </div>
      )}
      <div className="toolbar">
        <div className="filters">
          {['all', 'open', 'resolved'].map((f) => (
            <button
              key={f}
              className={'chip' + (filter === f ? ' active' : '')}
              onClick={() => {
                setFilter(f)
                setPage(1)
              }}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages, customers, emails..."
        />
        <button
          className="export-button"
          onClick={() => {
            downloadExport(filter, debouncedSearch, token).catch((err) => {
              setError('Export failed: ' + (err.message || 'unknown error'))
            })
          }}
        >
          Export CSV
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <table className="feedback-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Channel</th>
            <th>Priority</th>
            <th>Message</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Due</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '24px' }}>
                Loading...
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '24px' }}>
                No feedback items found.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="row" onClick={() => setSelectedId(item.id)}>
                <td>{item.customer_name}</td>
                <td>
                  <span className="channel">{item.channel}</span>
                </td>
                <td>
                  <span className={'priority ' + item.priority}>{item.priority}</span>
                </td>
                <td className="preview">
                  {item.message.slice(0, 70)}
                  {item.message.length > 70 ? '...' : ''}
                </td>
                <td>{item.assignee_name || 'Unassigned'}</td>
                <td>
                  <span className={'badge ' + item.status}>{item.status}</span>
                </td>
                <td>{item.due_at ? new Date(item.due_at).toLocaleDateString() : '-'}</td>
                <td>
                  <button
                    className="link-button"
                    disabled={resolving === item.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onResolve(item)
                    }}
                  >
                    {item.status === 'open' ? 'Resolve' : 'Reopen'}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}
