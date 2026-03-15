import { useState, useEffect } from 'react'
import { getEventLogs } from '../lib/api'
import { motion } from 'framer-motion'

interface EventLog {
  id: string
  repo: string
  eventType: string
  issueNumber: number | null
  status: string
  message: string
  createdAt: string
}

const statusColors: Record<string, string> = {
  received: '#f59e0b',
  processing: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
}

const eventTypeLabels: Record<string, string> = {
  manual_review: 'Manual Review',
  manual_resolve: 'Manual Resolve',
  manual_security: 'Security Scan',
  manual_explain: 'Explanation',
  auto_review: 'Auto Review',
  auto_triage: 'Auto Triage',
  review_completed: 'Review Done',
  resolve_completed: 'Resolve Done',
  security_completed: 'Security Done',
}

export default function EventLogsPage() {
  const [logs, setLogs] = useState<EventLog[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async (newOffset = 0) => {
    try {
      setLoading(true)
      const data = await getEventLogs(50, newOffset)
      if (newOffset === 0) {
        setLogs(data)
      } else {
        setLogs(prev => [...prev, ...data])
      }
      setHasMore(data.length === 50)
      setOffset(newOffset + data.length)
    } catch (err) {
      console.error('Failed to load event logs', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="events-view"
    >
      <div className="section-header">
        <h2>Event Logs</h2>
        <p>Track all webhook events and agent actions</p>
      </div>

      <div className="glass-card">
        <div className="events-list">
          {logs.length === 0 && !loading && (
            <p className="empty-msg">No events yet. Install the Archon App and use /archon on a PR or issue!</p>
          )}

          {logs.map((log) => (
            <div key={log.id} className="event-item">
              <div
                className="status-dot"
                style={{ backgroundColor: statusColors[log.status] || '#888' }}
              ></div>
              <div className="event-info">
                <div className="event-top">
                  <span className="event-type-badge">
                    {eventTypeLabels[log.eventType] || log.eventType}
                  </span>
                  <span className="event-repo">{log.repo}</span>
                  {log.issueNumber && (
                    <span className="event-issue">#{log.issueNumber}</span>
                  )}
                </div>
                <p className="event-message">{log.message}</p>
              </div>
              <span className="event-time">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
          ))}

          {loading && <p className="loading-msg">Loading...</p>}

          {hasMore && !loading && logs.length > 0 && (
            <button
              className="load-more-btn"
              onClick={() => loadLogs(offset)}
            >
              Load More
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
