import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getAnalyticsReviews, getAnalyticsQuality, getAnalyticsCosts, getAnalyticsRepos } from '../lib/api'

interface RepoStat {
    repoName: string
    reviews: number
    approved: number
    requestChanges: number
    inlineComments: number
    securityIssues: number
    approvalRate: number
    avgComments: number
    lastReviewedAt: string | null
}

interface ReviewSummary {
    total: number
    approved: number
    requestChanges: number
    totalComments: number
    avgComments: number
    totalTokens: number
    securityIssues: number
    approvalRate: number
}

interface QualityData {
    issueCategories: Array<{ category: string; count: number }>
    severityDistribution: Record<string, number>
    feedbackStats: { total: number; positive: number; negative: number; corrections: number }
    acceptanceRate: number
}

interface CostSummary {
    totalInput: number
    totalOutput: number
    totalReviews: number
}

export default function AnalyticsPage() {
    const [reviewData, setReviewData] = useState<{ summary: ReviewSummary; byDay: Record<string, any> } | null>(null)
    const [qualityData, setQualityData] = useState<QualityData | null>(null)
    const [costData, setCostData] = useState<{ summary: CostSummary; byDay: Record<string, any> } | null>(null)
    const [reposData, setReposData] = useState<{ repos: RepoStat[]; days: number } | null>(null)
    const [loading, setLoading] = useState(true)
    const [days, setDays] = useState(30)
    const [activeTab, setActiveTab] = useState<'overview' | 'quality' | 'costs' | 'repos'>('overview')

    useEffect(() => {
        setLoading(true)
        Promise.all([
            getAnalyticsReviews(days).catch(() => null),
            getAnalyticsQuality().catch(() => null),
            getAnalyticsCosts(days).catch(() => null),
            getAnalyticsRepos(days).catch(() => null),
        ]).then(([r, q, c, rp]) => {
            setReviewData(r)
            setQualityData(q)
            setCostData(c)
            setReposData(rp)
            setLoading(false)
        })
    }, [days])

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="analytics-page"
        >
            <div className="page-header">
                <div>
                    <h2>Analytics</h2>
                    <p>Review quality metrics, trends, and token usage</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {loading && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</span>
                    )}
                    <div className="period-selector">
                        {[7, 14, 30, 90].map(d => (
                            <button
                                key={d}
                                className={`period-btn ${days === d ? 'active' : ''}`}
                                onClick={() => setDays(d)}
                                disabled={loading}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="tab-bar">
                <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                    Review Overview
                </button>
                <button className={`tab-btn ${activeTab === 'quality' ? 'active' : ''}`} onClick={() => setActiveTab('quality')}>
                    Quality Metrics
                </button>
                <button className={`tab-btn ${activeTab === 'costs' ? 'active' : ''}`} onClick={() => setActiveTab('costs')}>
                    Token Costs
                </button>
                <button className={`tab-btn ${activeTab === 'repos' ? 'active' : ''}`} onClick={() => setActiveTab('repos')}>
                    Repos
                </button>
            </div>

            {loading
                ? <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading analytics...</div>
                : <>
                    {activeTab === 'overview' && <OverviewTab data={reviewData} />}
                    {activeTab === 'quality' && <QualityTab data={qualityData} />}
                    {activeTab === 'costs' && <CostsTab data={costData} />}
                    {activeTab === 'repos' && <ReposTab data={reposData} />}
                  </>
            }
        </motion.div>
    )
}

function OverviewTab({ data }: { data: { summary: ReviewSummary; byDay: Record<string, any> } | null }) {
    if (!data) return <EmptyState message="No review data yet. Analytics build as Archon reviews PRs." />

    const { summary, byDay } = data
    const sortedDays = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))

    return (
        <div>
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <StatCard title="Total Reviews" value={summary.total} />
                <StatCard title="Approval Rate" value={`${summary.approvalRate}%`} color={summary.approvalRate >= 70 ? 'var(--success)' : 'var(--warning)'} />
                <StatCard title="Avg Comments" value={summary.avgComments} />
                <StatCard title="Security Issues" value={summary.securityIssues} color={summary.securityIssues > 0 ? 'var(--error)' : 'var(--success)'} />
            </div>

            <div className="stats-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <StatCard title="Approved" value={summary.approved} />
                <StatCard title="Changes Requested" value={summary.requestChanges} />
                <StatCard title="Total Comments" value={summary.totalComments} />
            </div>

            {sortedDays.length > 0 && (
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Daily Review Activity</h3>
                    <div className="bar-chart">
                        {sortedDays.slice(-14).map(([day, stats]) => {
                            const maxCount = Math.max(...sortedDays.map(([, s]) => s.count), 1)
                            return (
                                <div key={day} className="bar-item">
                                    <div className="bar-stack">
                                        <div
                                            className="bar approved"
                                            style={{ height: `${(stats.approved / maxCount) * 120}px` }}
                                            title={`${stats.approved} approved`}
                                        />
                                        <div
                                            className="bar changes"
                                            style={{ height: `${(stats.changes / maxCount) * 120}px` }}
                                            title={`${stats.changes} changes requested`}
                                        />
                                    </div>
                                    <span className="bar-label">{day.slice(5)}</span>
                                    <span className="bar-count">{stats.count}</span>
                                </div>
                            )
                        })}
                    </div>
                    <div className="chart-legend">
                        <span><span className="legend-dot approved" /> Approved</span>
                        <span><span className="legend-dot changes" /> Changes Requested</span>
                    </div>
                </div>
            )}
        </div>
    )
}

function QualityTab({ data }: { data: QualityData | null }) {
    if (!data) return <EmptyState message="No quality data yet." />

    const { issueCategories, severityDistribution, feedbackStats, acceptanceRate } = data

    return (
        <div>
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <StatCard title="Acceptance Rate" value={`${acceptanceRate}%`} color={acceptanceRate >= 70 ? 'var(--success)' : 'var(--warning)'} />
                <StatCard title="Total Feedback" value={feedbackStats.total} />
                <StatCard title="Positive" value={feedbackStats.positive} color="var(--success)" />
                <StatCard title="Corrections" value={feedbackStats.corrections} color="var(--warning)" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {issueCategories.length > 0 && (
                    <div className="glass-card" style={{ padding: '1.5rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Top Issue Categories</h3>
                        <div className="category-list">
                            {issueCategories.map((cat, i) => {
                                const maxCount = issueCategories[0]?.count || 1
                                return (
                                    <div key={i} className="category-row">
                                        <span className="category-name">{cat.category.replace(/_/g, ' ')}</span>
                                        <div className="category-bar-container">
                                            <div className="category-bar" style={{ width: `${(cat.count / maxCount) * 100}%` }} />
                                        </div>
                                        <span className="category-count">{cat.count}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {Object.keys(severityDistribution).length > 0 && (
                    <div className="glass-card" style={{ padding: '1.5rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Severity Distribution</h3>
                        <div className="severity-grid">
                            {Object.entries(severityDistribution).map(([level, count]) => (
                                <div key={level} className={`severity-card ${level}`}>
                                    <span className="severity-level">{level}</span>
                                    <span className="severity-count">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function CostsTab({ data }: { data: { summary: CostSummary; byDay: Record<string, any> } | null }) {
    if (!data) return <EmptyState message="No cost data yet." />

    const { summary, byDay } = data
    const sortedDays = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
    const totalTokens = summary.totalInput + summary.totalOutput
    const avgPerReview = summary.totalReviews > 0 ? Math.round(totalTokens / summary.totalReviews) : 0

    return (
        <div>
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <StatCard title="Total Tokens" value={formatTokens(totalTokens)} />
                <StatCard title="Input Tokens" value={formatTokens(summary.totalInput)} />
                <StatCard title="Output Tokens" value={formatTokens(summary.totalOutput)} />
                <StatCard title="Avg per Review" value={formatTokens(avgPerReview)} />
            </div>

            {sortedDays.length > 0 && (
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Daily Token Usage</h3>
                    <div className="bar-chart">
                        {sortedDays.slice(-14).map(([day, stats]) => {
                            const maxTokens = Math.max(...sortedDays.map(([, s]) => s.input + s.output), 1)
                            const total = stats.input + stats.output
                            return (
                                <div key={day} className="bar-item">
                                    <div className="bar-stack">
                                        <div
                                            className="bar input-tokens"
                                            style={{ height: `${(stats.input / maxTokens) * 120}px` }}
                                            title={`${formatTokens(stats.input)} input`}
                                        />
                                        <div
                                            className="bar output-tokens"
                                            style={{ height: `${(stats.output / maxTokens) * 120}px` }}
                                            title={`${formatTokens(stats.output)} output`}
                                        />
                                    </div>
                                    <span className="bar-label">{day.slice(5)}</span>
                                    <span className="bar-count">{formatTokens(total)}</span>
                                </div>
                            )
                        })}
                    </div>
                    <div className="chart-legend">
                        <span><span className="legend-dot input-tokens" /> Input</span>
                        <span><span className="legend-dot output-tokens" /> Output</span>
                    </div>
                </div>
            )}
        </div>
    )
}

function ReposTab({ data }: { data: { repos: RepoStat[]; days: number } | null }) {
    if (!data || data.repos.length === 0) {
        return <EmptyState message="No repo data yet. Analytics build as Archon reviews PRs." />
    }

    const { repos } = data
    const maxReviews = Math.max(...repos.map(r => r.reviews), 1)

    return (
        <div>
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <StatCard title="Repos Tracked" value={repos.length} />
                <StatCard title="Most Active" value={repos[0]?.repoName.split('/')[1] || '—'} />
                <StatCard title="Total Reviews" value={repos.reduce((s, r) => s + r.reviews, 0)} />
                <StatCard title="Total Security Issues" value={repos.reduce((s, r) => s + r.securityIssues, 0)} color="var(--error)" />
            </div>

            <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Per-Repo Breakdown</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Repository</th>
                                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Reviews</th>
                                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Approval %</th>
                                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Avg Comments</th>
                                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Security Issues</th>
                                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Last Reviewed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {repos.map(r => (
                                <tr key={r.repoName} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    <td style={{ padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ flex: 1, maxWidth: 200 }}>
                                                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${(r.reviews / maxReviews) * 100}%`, background: 'var(--accent)', borderRadius: 2 }} />
                                                </div>
                                            </div>
                                            <span style={{ fontWeight: 500 }}>{r.repoName}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>{r.reviews}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <span style={{ color: r.approvalRate >= 70 ? 'var(--success)' : r.approvalRate >= 40 ? 'var(--warning)' : 'var(--error)' }}>
                                            {r.reviews > 0 ? `${r.approvalRate}%` : '—'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>{r.reviews > 0 ? r.avgComments : '—'}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <span style={{ color: r.securityIssues > 0 ? 'var(--error)' : 'var(--text-muted)' }}>
                                            {r.securityIssues}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                                        {r.lastReviewedAt ? new Date(r.lastReviewedAt).toLocaleDateString() : 'Never'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function StatCard({ title, value, color }: { title: string; value: string | number; color?: string }) {
    return (
        <div className="glass-card stat-card">
            <div className="stat-content">
                <p className="stat-title">{title}</p>
                <h2 className="stat-value" style={color ? { color } : undefined}>{value}</h2>
            </div>
        </div>
    )
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
            <p>{message}</p>
        </div>
    )
}

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
}
