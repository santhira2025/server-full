import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    ListTodo, Clock, Loader2, CheckCircle2, XCircle,
    GitPullRequest, RefreshCw
} from 'lucide-react'
import { getTasks } from '../lib/api'

interface Task {
    id: string
    repo: string
    issueNumber: number
    taskType: string
    status: string
    triggerType: string
    triggeredBy: string | null
    summary: string | null
    error: string | null
    inputTokens: number
    outputTokens: number
    startedAt: string | null
    completedAt: string | null
    createdAt: string
}

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
    queued: { color: '#888', icon: Clock, label: 'Queued' },
    processing: { color: '#3b82f6', icon: Loader2, label: 'Processing' },
    completed: { color: '#22c55e', icon: CheckCircle2, label: 'Completed' },
    failed: { color: '#ef4444', icon: XCircle, label: 'Failed' },
}

const TASK_LABELS: Record<string, string> = {
    review: 'Review',
    resolve: 'Resolve',
    security: 'Security',
    explain: 'Explain',
    analyze: 'Analyze',
    fix: 'Fix Feedback',
    all: 'Fix All',
}

function timeAgo(date: string): string {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
}

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<string>('all')

    const fetchTasks = async () => {
        try {
            const result = await getTasks(100, 0, filter === 'all' ? undefined : filter)
            setTasks(result || [])
        } catch (e) {
            console.error('Failed to fetch tasks:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchTasks()
        const interval = setInterval(fetchTasks, 10000)
        return () => clearInterval(interval)
    }, [filter])

    const filters = ['all', 'queued', 'processing', 'completed', 'failed']

    const counts = {
        all: tasks.length,
        queued: tasks.filter(t => t.status === 'queued').length,
        processing: tasks.filter(t => t.status === 'processing').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length,
    }

    return (
        <div className="page-content">
            <div className="page-header">
                <h1><ListTodo size={24} /> Task Queue</h1>
                <button className="btn-secondary" onClick={fetchTasks} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            <div className="filter-tabs" style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                {filters.map(f => (
                    <button
                        key={f}
                        className={`filter-tab ${filter === f ? 'active' : ''}`}
                        onClick={() => { setFilter(f); setLoading(true) }}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                            background: filter === f ? 'var(--primary)' : 'var(--card-bg)',
                            color: filter === f ? '#fff' : 'var(--text-secondary)',
                            transition: 'all 0.2s',
                        }}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f as keyof typeof counts] || 0})
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                    <Loader2 size={32} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Loading tasks...</p>
                </div>
            ) : tasks.length === 0 ? (
                <div className="empty-state" style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                    <ListTodo size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                    <h3>No tasks yet</h3>
                    <p>Tasks will appear here when you use /archon commands on GitHub.</p>
                </div>
            ) : (
                <div className="tasks-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {tasks.map((task, i) => {
                        const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.queued
                        const StatusIcon = statusConfig.icon
                        return (
                            <motion.div
                                key={task.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                className="card"
                                style={{ padding: 16 }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                                        <StatusIcon
                                            size={20}
                                            style={{
                                                color: statusConfig.color,
                                                ...(task.status === 'processing' ? { animation: 'spin 1s linear infinite' } : {}),
                                            }}
                                        />
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <span style={{
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    padding: '2px 8px',
                                                    borderRadius: 4,
                                                    background: 'var(--primary-dim)',
                                                    color: 'var(--primary)',
                                                    textTransform: 'uppercase',
                                                }}>
                                                    {TASK_LABELS[task.taskType] || task.taskType}
                                                </span>
                                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                                    <GitPullRequest size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                                    {task.repo.split('/').pop()}#{task.issueNumber}
                                                </span>
                                                {task.triggeredBy && (
                                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                        by @{task.triggeredBy}
                                                    </span>
                                                )}
                                            </div>
                                            {task.summary && (
                                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, maxWidth: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {task.summary.substring(0, 120)}
                                                </p>
                                            )}
                                            {task.error && (
                                                <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>
                                                    {task.error.substring(0, 120)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <span style={{
                                            fontSize: 12,
                                            padding: '3px 10px',
                                            borderRadius: 12,
                                            background: statusConfig.color + '20',
                                            color: statusConfig.color,
                                            fontWeight: 500,
                                        }}>
                                            {statusConfig.label}
                                        </span>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                            {timeAgo(task.createdAt)}
                                        </div>
                                        {(task.inputTokens > 0 || task.outputTokens > 0) && (
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                                {task.inputTokens + task.outputTokens} tokens
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            )}

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}
