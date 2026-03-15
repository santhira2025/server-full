import { useState, useEffect, useCallback } from 'react'
import {
    FileText, Shield, Search, Download, RefreshCw, CheckCircle,
    Clock, XCircle, Loader2, ChevronDown, ChevronRight,
    BookOpen, ShieldAlert,
} from 'lucide-react'
import { getRepos, getReports, runReport, downloadReport, getReportTasks } from '../lib/api'

interface Repo { id: string; fullName: string; isActive: boolean }
interface ReportResult {
    id: string; repo: string; actionType: string; verdict: string | null
    summary: string | null; filesReviewed: number | null
    securityIssuesCount: number | null; inlineCommentsCount: number | null
    status: string; completedAt: string | null; createdAt: string
}
interface ReportTask {
    id: string; repo: string; taskType: string; status: string
    summary: string | null; error: string | null
    createdAt: string; completedAt: string | null
}
interface TaskProgress { stage: string; current: number; total: number; currentFile: string | null }

function parseProgress(summary: string | null): TaskProgress | null {
    if (!summary) return null
    try {
        const p = JSON.parse(summary)
        if (p.stage && typeof p.current === 'number') return p as TaskProgress
    } catch { /* not JSON */ }
    return null
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
    analyze:          { label: 'Project Analysis',  icon: <Search size={12}/>,     color: '#7c3aed', bg: '#7c3aed18' },
    report:           { label: 'Security Report',   icon: <Shield size={12}/>,     color: '#dc2626', bg: '#dc262618' },
    security:         { label: 'Security Scan',     icon: <Shield size={12}/>,     color: '#ea580c', bg: '#ea580c18' },
    review:           { label: 'Code Review',       icon: <FileText size={12}/>,   color: '#2563eb', bg: '#2563eb18' },
    'full-review':    { label: 'Technical Review',  icon: <BookOpen size={12}/>,   color: '#0891b2', bg: '#0891b218' },
    'security-audit': { label: 'Security Audit',    icon: <ShieldAlert size={12}/>,color: '#b91c1c', bg: '#b91c1c18' },
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
    completed:  <CheckCircle size={12} style={{ color: '#16a34a' }} />,
    failed:     <XCircle     size={12} style={{ color: '#dc2626' }} />,
    running:    <Loader2     size={12} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite' }} />,
    processing: <Loader2     size={12} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite' }} />,
    queued:     <Clock       size={12} style={{ color: '#d97706' }} />,
}

function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Active task progress bar ───────────────────────────────────────────
function TaskProgress({ task }: { task: ReportTask }) {
    const progress = parseProgress(task.summary)
    const cfg = ACTION_CONFIG[task.taskType] || ACTION_CONFIG.analyze
    const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

    return (
        <div style={{
            padding: '12px 16px',
            background: 'var(--surface)',
            border: `1px solid ${cfg.color}33`,
            borderLeft: `3px solid ${cfg.color}`,
            borderRadius: '8px',
            marginBottom: '8px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Loader2 size={14} style={{ color: cfg.color, animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{task.repo}</span>
                <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: cfg.color }}>{pct}%</span>
                {progress && progress.total > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {progress.current} / {progress.total} files
                    </span>
                )}
            </div>
            <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                    height: '100%', width: `${Math.max(pct, 2)}%`,
                    background: cfg.color, borderRadius: '2px',
                    transition: 'width 0.4s ease',
                }} />
            </div>
            {progress?.stage && (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '5px' }}>{progress.stage}</div>
            )}
        </div>
    )
}

export default function ReportsPage() {
    const [repos, setRepos] = useState<Repo[]>([])
    const [reports, setReports] = useState<ReportResult[]>([])
    const [tasks, setTasks] = useState<ReportTask[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedRepo, setSelectedRepo] = useState<string>('all')
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [running, setRunning] = useState<string | null>(null)
    const [downloading, setDownloading] = useState<string | null>(null)
    const [expandedReport, setExpandedReport] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        try {
            const [repoData, reportData, taskData] = await Promise.all([
                getRepos().catch(() => []),
                getReports({
                    repo: selectedRepo !== 'all' ? selectedRepo : undefined,
                    type: typeFilter !== 'all' ? typeFilter : undefined,
                    limit: 50,
                }).catch(() => ({ reports: [] })),
                getReportTasks().catch(() => ({ tasks: [] })),
            ])
            setRepos(repoData || [])
            setReports(reportData.reports || [])
            setTasks(taskData.tasks || [])
        } finally {
            setLoading(false)
        }
    }, [selectedRepo, typeFilter])

    useEffect(() => { setLoading(true); loadData() }, [loadData])

    // Poll every 2s while tasks are active
    useEffect(() => {
        const hasActive = tasks.some(t => ['queued','processing','running'].includes(t.status))
        if (!hasActive) return
        const id = setInterval(loadData, 2000)
        return () => clearInterval(id)
    }, [tasks, loadData])

    async function handleRun(repoId: string, action: string) {
        setRunning(`${repoId}-${action}`)
        try {
            await runReport({ repoId, action })
            await loadData()
        } catch (err: any) {
            alert(`Failed: ${err?.response?.data?.error || err.message}`)
        } finally {
            setRunning(null)
        }
    }

    async function handleDownload(reportId: string, repo: string, actionType: string) {
        setDownloading(reportId)
        try {
            const content = await downloadReport(reportId)
            const date = new Date().toISOString().split('T')[0]
            const filename = `archon-${actionType}-${repo.replace('/', '-')}-${date}.md`
            const blob = new Blob([content], { type: 'text/markdown' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = filename; a.click()
            URL.revokeObjectURL(url)
        } catch (err: any) {
            alert(`Download failed: ${err.message}`)
        } finally {
            setDownloading(null)
        }
    }

    const activeRepos = repos.filter(r => r.isActive)
    const activeTasks = tasks.filter(t => ['queued','processing','running'].includes(t.status))

    if (loading) return (
        <div className="loading-state">
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading...</span>
        </div>
    )

    return (
        <div className="page-content">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1>Reports</h1>
                    <p className="page-subtitle">Generate and download technical & security reports</p>
                </div>
                <button className="btn-secondary" onClick={loadData}>
                    <RefreshCw size={14} />Refresh
                </button>
            </div>

            {/* Active task progress bars */}
            {activeTasks.map(task => <TaskProgress key={task.id} task={task} />)}

            {/* Generate section */}
            <div className="glass-card" style={{ padding: '16px 18px', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-main)' }}>
                    Generate Report
                </h2>
                {activeRepos.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        No active repositories. Install the GitHub App to add repos.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {activeRepos.map(repo => {
                            return (
                                <div key={repo.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 12px',
                                    background: 'var(--surface-hover)', borderRadius: '7px',
                                    flexWrap: 'wrap',
                                }}>
                                    <span style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 500, flex: '1 1 120px' }}>
                                        {repo.fullName}
                                    </span>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {([
                                            { action: 'analyze',        label: 'Analyze',          color: '#7c3aed', icon: <Search size={11}/> },
                                            { action: 'report',         label: 'Security Report',  color: '#dc2626', icon: <Shield size={11}/> },
                                            { action: 'full-review',    label: 'Technical Review', color: '#0891b2', icon: <BookOpen size={11}/> },
                                            { action: 'security-audit', label: 'Security Audit',   color: '#b91c1c', icon: <ShieldAlert size={11}/> },
                                        ] as const).map(({ action, label, color, icon }) => (
                                            <button
                                                key={action}
                                                disabled={!!running}
                                                onClick={() => handleRun(repo.id, action)}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                    padding: '5px 11px', fontSize: '12px', fontWeight: 500,
                                                    background: color, color: '#fff',
                                                    border: 'none', borderRadius: '5px',
                                                    cursor: running ? 'not-allowed' : 'pointer',
                                                    opacity: running ? 0.55 : 1,
                                                    transition: 'opacity 0.15s',
                                                    fontFamily: 'inherit',
                                                }}
                                            >
                                                {running === `${repo.id}-${action}`
                                                    ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                                    : icon}
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="filter-select" value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)}>
                    <option value="all">All repositories</option>
                    {repos.map(r => <option key={r.id} value={r.fullName}>{r.fullName}</option>)}
                </select>
                <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="all">All types</option>
                    <option value="full-review">Technical Review</option>
                    <option value="security-audit">Security Audit</option>
                    <option value="analyze">Project Analysis</option>
                    <option value="report">Security Report</option>
                </select>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {reports.length} result{reports.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Reports list */}
            {reports.length === 0 ? (
                <div className="glass-card" style={{ padding: '36px', textAlign: 'center' }}>
                    <FileText size={28} style={{ color: 'var(--text-dim)', margin: '0 auto 10px' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No reports yet. Generate one above.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {reports.map(report => {
                        const cfg = ACTION_CONFIG[report.actionType] || ACTION_CONFIG.review
                        const isExpanded = expandedReport === report.id
                        const isDl = downloading === report.id

                        return (
                            <div key={report.id} className="glass-card" style={{
                                overflow: 'hidden',
                                borderLeft: `3px solid ${cfg.color}`,
                            }}>
                                <div
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        padding: '10px 14px', gap: '10px',
                                        cursor: 'pointer', flexWrap: 'wrap',
                                    }}
                                    onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                                >
                                    <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
                                        {isExpanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                                    </span>

                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        fontSize: '10px', fontWeight: 700, padding: '2px 7px',
                                        borderRadius: '4px', background: cfg.bg, color: cfg.color,
                                        flexShrink: 0,
                                    }}>
                                        {cfg.icon}{cfg.label}
                                    </span>

                                    <span style={{ fontSize: '12px', fontFamily: 'monospace', flex: 1, minWidth: '80px' }}>
                                        {report.repo}
                                    </span>

                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {STATUS_ICONS[report.status] || STATUS_ICONS.queued}
                                        {report.status}
                                    </span>

                                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', flexShrink: 0 }}>
                                        {formatDate(report.completedAt || report.createdAt)}
                                    </span>

                                    {report.status === 'completed' && (
                                        <button
                                            disabled={isDl}
                                            onClick={e => { e.stopPropagation(); handleDownload(report.id, report.repo, report.actionType) }}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                fontSize: '11px', padding: '3px 9px', borderRadius: '4px',
                                                background: 'var(--surface-hover)', border: '1px solid var(--border-color)',
                                                color: 'var(--text-main)', cursor: 'pointer',
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            {isDl ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={11} />}
                                            Download
                                        </button>
                                    )}
                                </div>

                                {isExpanded && (
                                    <div style={{
                                        padding: '10px 14px 12px 38px',
                                        borderTop: `1px solid ${cfg.color}22`,
                                        background: cfg.bg,
                                    }}>
                                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                            {report.filesReviewed != null && (
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    <strong style={{ color: cfg.color }}>{report.filesReviewed}</strong> files
                                                </span>
                                            )}
                                            {(report.securityIssuesCount ?? 0) > 0 && (
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    <strong style={{ color: '#ef4444' }}>{report.securityIssuesCount}</strong> security issues
                                                </span>
                                            )}
                                            {(report.inlineCommentsCount ?? 0) > 0 && (
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    <strong style={{ color: 'var(--text-main)' }}>{report.inlineCommentsCount}</strong> comments
                                                </span>
                                            )}
                                            {report.verdict && (
                                                <span style={{ fontSize: '12px', color: cfg.color, fontWeight: 600 }}>{report.verdict}</span>
                                            )}
                                        </div>
                                        {report.summary && (
                                            <p style={{
                                                fontSize: '12px', color: 'var(--text-muted)',
                                                lineHeight: 1.5, margin: 0,
                                                display: '-webkit-box', WebkitLineClamp: 4,
                                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                            }}>
                                                {report.summary}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
