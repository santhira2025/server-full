import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Shield, GitPullRequest, Users, AlertTriangle,
    Activity, TrendingUp, Eye, FileSearch
} from 'lucide-react'
import { getAdminOverview, getStats } from '../lib/api'

interface DashboardData {
    metrics: {
        teamMembers: number
        admins: number
        activeWebhooks: number
        recentHighRiskPRs: number
        reviewsLast20: number
    }
    events: any[]
    reviews: any[]
    risks: any[]
    releaseNotes: any[]
}

export default function DashboardPage({ connected }: { connected: boolean }) {
    const [data, setData] = useState<DashboardData | null>(null)
    const [stats, setStats] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        try {
            const [overview, dashStats] = await Promise.all([
                getAdminOverview().catch(() => null),
                getStats().catch(() => null),
            ])
            if (overview) setData(overview)
            if (dashStats) setStats(dashStats)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 30000)
        return () => clearInterval(interval)
    }, [])

    if (loading) {
        return (
            <div className="dashboard-page">
                <div className="stats-grid">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="glass-card stat-card skeleton-card">
                            <div className="skeleton skeleton-icon" />
                            <div className="skeleton-content">
                                <div className="skeleton skeleton-text-sm" />
                                <div className="skeleton skeleton-text-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const totalReviews = data?.metrics?.reviewsLast20 || 0
    const totalMembers = data?.metrics?.teamMembers || 1
    const highRisk = data?.metrics?.recentHighRiskPRs || 0
    const webhooksActive = data?.metrics?.activeWebhooks || 0

    // Calculate stats from reviews
    const approvedCount = data?.reviews?.filter((r: any) => r.verdict === 'APPROVE').length || 0
    const securityIssues = data?.reviews?.reduce((sum: number, r: any) => sum + (r.securityIssuesCount || 0), 0) || 0
    const totalTokens = data?.reviews?.reduce((sum: number, r: any) => sum + (r.inputTokens || 0) + (r.outputTokens || 0), 0) || 0

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="dashboard-page"
        >
            {/* Live Status Banner */}
            <div className="live-banner">
                <div className={`live-dot ${connected ? 'live' : 'offline'}`} />
                <span>{connected ? 'Live — Real-time updates active' : 'Connecting...'}</span>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <StatCard
                    icon={<FileSearch className="icon-orange" />}
                    title="Total Reviews"
                    value={String(totalReviews)}
                    sub={`${approvedCount} approved`}
                    color="orange"
                />
                <StatCard
                    icon={<Shield className="icon-green" />}
                    title="Security Issues"
                    value={String(securityIssues)}
                    sub={securityIssues === 0 ? 'All clear' : 'Found in reviews'}
                    color="green"
                />
                <StatCard
                    icon={<Users className="icon-blue" />}
                    title="Team Members"
                    value={String(totalMembers)}
                    sub={`${data?.metrics?.admins || 1} admin(s)`}
                    color="blue"
                />
                <StatCard
                    icon={<AlertTriangle className="icon-purple" />}
                    title="High Risk PRs"
                    value={String(highRisk)}
                    sub={highRisk === 0 ? 'No high-risk PRs' : 'Needs attention'}
                    color="purple"
                />
            </div>

            {/* Two Column Layout */}
            <div className="dashboard-grid">
                {/* Recent Reviews */}
                <div className="glass-card dashboard-card">
                    <div className="card-header">
                        <h3><GitPullRequest size={18} /> Recent Reviews</h3>
                        <span className="card-count">{data?.reviews?.length || 0}</span>
                    </div>
                    <div className="dashboard-list">
                        {data?.reviews && data.reviews.length > 0 ? (
                            data.reviews.slice(0, 8).map((review: any, i: number) => (
                                <motion.div
                                    key={review.id || i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="dash-list-item"
                                >
                                    <div className={`verdict-dot ${getVerdictColor(review.verdict)}`} />
                                    <div className="dash-item-info">
                                        <span className="dash-item-title">{review.repo}</span>
                                        <span className="dash-item-sub">
                                            #{review.issueNumber} · {review.actionType} · {review.filesReviewed || 0} files
                                        </span>
                                    </div>
                                    <div className="dash-item-meta">
                                        <span className={`mini-badge ${getVerdictColor(review.verdict)}`}>
                                            {review.verdict || 'COMMENT'}
                                        </span>
                                        <span className="dash-item-time">
                                            {timeAgo(review.createdAt)}
                                        </span>
                                    </div>
                                </motion.div>
                            ))
                        ) : (
                            <div className="empty-state">
                                <Eye size={32} className="icon-dim" />
                                <p>No reviews yet</p>
                                <span>Comment <code>/archon review</code> on any PR to start</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Activity Feed */}
                <div className="glass-card dashboard-card">
                    <div className="card-header">
                        <h3><Activity size={18} /> Live Activity</h3>
                        <span className="card-count">{data?.events?.length || 0}</span>
                    </div>
                    <div className="dashboard-list">
                        {data?.events && data.events.length > 0 ? (
                            data.events.slice(0, 10).map((event: any, i: number) => (
                                <motion.div
                                    key={event.id || i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="dash-list-item"
                                >
                                    <div className={`status-dot ${event.status || 'success'}`} />
                                    <div className="dash-item-info">
                                        <span className="dash-item-title">
                                            {formatEventType(event.eventType)}
                                        </span>
                                        <span className="dash-item-sub">
                                            {event.repo || 'system'}{event.issueNumber ? ` #${event.issueNumber}` : ''}
                                        </span>
                                    </div>
                                    <span className="dash-item-time">{timeAgo(event.createdAt)}</span>
                                </motion.div>
                            ))
                        ) : (
                            <div className="empty-state">
                                <Activity size={32} className="icon-dim" />
                                <p>No activity yet</p>
                                <span>Events will appear here as you use Archon</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Row: Risk Scores + Token Usage */}
            <div className="dashboard-grid">
                {/* Risk Scores */}
                <div className="glass-card dashboard-card">
                    <div className="card-header">
                        <h3><AlertTriangle size={18} /> PR Risk Scores</h3>
                    </div>
                    <div className="dashboard-list">
                        {data?.risks && data.risks.length > 0 ? (
                            data.risks.slice(0, 6).map((risk: any, i: number) => (
                                <div key={risk.id || i} className="dash-list-item">
                                    <div className={`risk-indicator risk-${risk.riskLevel}`} />
                                    <div className="dash-item-info">
                                        <span className="dash-item-title">{risk.repo} #{risk.prNumber}</span>
                                        <span className="dash-item-sub">
                                            Score: {risk.riskScore}/100 · {risk.riskLevel}
                                        </span>
                                    </div>
                                    <span className={`mini-badge risk-${risk.riskLevel}`}>
                                        {risk.riskLevel?.toUpperCase()}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state small">
                                <p>No risk assessments yet</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="glass-card dashboard-card">
                    <div className="card-header">
                        <h3><TrendingUp size={18} /> Usage Summary</h3>
                    </div>
                    <div className="usage-summary">
                        <div className="usage-row">
                            <span>Total Tokens Used</span>
                            <strong>{formatNumber(totalTokens)}</strong>
                        </div>
                        <div className="usage-row">
                            <span>Active Webhooks</span>
                            <strong>{webhooksActive}</strong>
                        </div>
                        <div className="usage-row">
                            <span>Current Plan</span>
                            <strong className="plan-highlight">{stats?.org?.plan?.toUpperCase() || 'FREE'}</strong>
                        </div>
                        <div className="usage-row">
                            <span>API Requests (recent)</span>
                            <strong>{stats?.usage?.length || 0}</strong>
                        </div>
                        <div className="usage-row">
                            <span>Release Notes Generated</span>
                            <strong>{data?.releaseNotes?.length || 0}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

function StatCard({ icon, title, value, sub, color }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass-card stat-card stat-${color}`}
        >
            <div className="stat-icon">{icon}</div>
            <div className="stat-content">
                <p className="stat-title">{title}</p>
                <h2 className="stat-value">{value}</h2>
                <span className="stat-sub">{sub}</span>
            </div>
        </motion.div>
    )
}

function getVerdictColor(verdict: string) {
    switch (verdict) {
        case 'APPROVE': return 'success'
        case 'REQUEST_CHANGES': return 'error'
        default: return 'warning'
    }
}

function formatEventType(type: string) {
    if (!type) return 'Event'
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function timeAgo(dateStr: string) {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

function formatNumber(n: number) {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return String(n)
}
