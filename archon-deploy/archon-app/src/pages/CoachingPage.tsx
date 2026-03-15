import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getTeamReport, getDevelopers } from '../lib/api'

interface DeveloperProfile {
    id: string
    githubLogin: string
    skillLevel: string
    weakAreas: Record<string, number>
    strongAreas: Record<string, number>
    totalReviews: number
    totalIssuesFound: number
    repeatedMistakes: number
    securityScore: number
    lastReviewedAt: string | null
}

interface TeamReport {
    period: string
    totalReviews: number
    totalIssues: number
    commonMistakes: Array<{ type: string; count: number; developers: string[] }>
    developerSummaries: Array<{
        githubLogin: string
        skillLevel: string
        totalReviews: number
        securityScore: number
        topWeakAreas: string[]
        repeatedMistakes: number
        trend: string
    }>
    recommendedTraining: string[]
}

export default function CoachingPage() {
    const [report, setReport] = useState<TeamReport | null>(null)
    const [developers, setDevelopers] = useState<DeveloperProfile[]>([])
    const [loading, setLoading] = useState(true)
    const [activeView, setActiveView] = useState<'team' | 'developers'>('team')
    const [expandedDev, setExpandedDev] = useState<string | null>(null)

    useEffect(() => {
        Promise.all([
            getTeamReport().catch(() => null),
            getDevelopers().catch(() => []),
        ]).then(([r, d]) => {
            setReport(r)
            setDevelopers(d)
            setLoading(false)
        })
    }, [])

    if (loading) {
        return <div className="loading-state">Loading coaching data...</div>
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="coaching-page"
        >
            <div className="page-header">
                <h2>Archon Coach</h2>
                <p>Developer skill tracking & team knowledge gaps</p>
            </div>

            <div className="tab-bar">
                <button
                    className={`tab-btn ${activeView === 'team' ? 'active' : ''}`}
                    onClick={() => setActiveView('team')}
                >
                    Team Report
                </button>
                <button
                    className={`tab-btn ${activeView === 'developers' ? 'active' : ''}`}
                    onClick={() => setActiveView('developers')}
                >
                    Developer Profiles ({developers.length})
                </button>
            </div>

            {activeView === 'team' && report && <TeamReportView report={report} />}
            {activeView === 'team' && !report && (
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                    <p>No team data yet. Coaching data builds automatically as Archon reviews PRs.</p>
                </div>
            )}
            {activeView === 'developers' && (
                <DeveloperListView
                    developers={developers}
                    expandedDev={expandedDev}
                    onToggle={(login) => setExpandedDev(expandedDev === login ? null : login)}
                />
            )}
        </motion.div>
    )
}

function TeamReportView({ report }: { report: TeamReport }) {
    return (
        <div className="team-report">
            {/* Stats row */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="glass-card stat-card">
                    <div className="stat-content">
                        <p className="stat-title">Total Reviews</p>
                        <h2 className="stat-value">{report.totalReviews}</h2>
                    </div>
                </div>
                <div className="glass-card stat-card">
                    <div className="stat-content">
                        <p className="stat-title">Issues Found</p>
                        <h2 className="stat-value">{report.totalIssues}</h2>
                    </div>
                </div>
                <div className="glass-card stat-card">
                    <div className="stat-content">
                        <p className="stat-title">Developers</p>
                        <h2 className="stat-value">{report.developerSummaries.length}</h2>
                    </div>
                </div>
                <div className="glass-card stat-card">
                    <div className="stat-content">
                        <p className="stat-title">Period</p>
                        <h2 className="stat-value" style={{ fontSize: '1rem' }}>{report.period}</h2>
                    </div>
                </div>
            </div>

            {/* Common mistakes */}
            {report.commonMistakes.length > 0 && (
                <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Most Common Mistakes</h3>
                    <div className="mistake-list">
                        {report.commonMistakes.map((m, i) => (
                            <div key={i} className="mistake-row">
                                <div className="mistake-bar" style={{ width: `${Math.min(100, (m.count / (report.commonMistakes[0]?.count || 1)) * 100)}%` }} />
                                <span className="mistake-label">{m.type}</span>
                                <span className="mistake-count">{m.count}x</span>
                                <span className="mistake-devs">
                                    {m.developers.map(d => `@${d}`).join(', ')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Training recommendations */}
            {report.recommendedTraining.length > 0 && (
                <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Recommended Training</h3>
                    <ul className="training-list">
                        {report.recommendedTraining.map((t, i) => (
                            <li key={i}>{t}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Developer summary table */}
            {report.developerSummaries.length > 0 && (
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Developer Summary</h3>
                    <table className="dev-table">
                        <thead>
                            <tr>
                                <th>Developer</th>
                                <th>Level</th>
                                <th>Reviews</th>
                                <th>Security</th>
                                <th>Repeats</th>
                                <th>Trend</th>
                                <th>Top Weak Areas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.developerSummaries.map((dev, i) => (
                                <tr key={i}>
                                    <td>
                                        <div className="dev-cell">
                                            <img
                                                src={`https://github.com/${dev.githubLogin}.png`}
                                                alt={dev.githubLogin}
                                                className="dev-avatar-small"
                                            />
                                            @{dev.githubLogin}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`skill-badge ${dev.skillLevel}`}>
                                            {dev.skillLevel}
                                        </span>
                                    </td>
                                    <td>{dev.totalReviews}</td>
                                    <td>
                                        <span className={`score ${dev.securityScore >= 70 ? 'good' : dev.securityScore >= 40 ? 'ok' : 'bad'}`}>
                                            {dev.securityScore}/100
                                        </span>
                                    </td>
                                    <td>{dev.repeatedMistakes}</td>
                                    <td>
                                        <span className={`trend-badge ${dev.trend}`}>
                                            {dev.trend === 'improving' ? '↑' : dev.trend === 'declining' ? '↓' : '→'} {dev.trend}
                                        </span>
                                    </td>
                                    <td>{dev.topWeakAreas.join(', ') || 'none'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function DeveloperListView({
    developers,
    expandedDev,
    onToggle
}: {
    developers: DeveloperProfile[]
    expandedDev: string | null
    onToggle: (login: string) => void
}) {
    if (developers.length === 0) {
        return (
            <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                <p>No developer profiles yet. Profiles are created automatically when Archon reviews PRs.</p>
            </div>
        )
    }

    return (
        <div className="developer-list">
            {developers.map(dev => (
                <div key={dev.id} className="glass-card dev-card" style={{ marginBottom: '1rem', padding: '1.5rem' }}>
                    <div
                        className="dev-header"
                        onClick={() => onToggle(dev.githubLogin)}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}
                    >
                        <img
                            src={`https://github.com/${dev.githubLogin}.png`}
                            alt={dev.githubLogin}
                            className="dev-avatar"
                        />
                        <div style={{ flex: 1 }}>
                            <h3 style={{ margin: 0 }}>@{dev.githubLogin}</h3>
                            <div className="dev-meta">
                                <span className={`skill-badge ${dev.skillLevel}`}>{dev.skillLevel}</span>
                                <span>{dev.totalReviews} reviews</span>
                                <span>Security: {dev.securityScore}/100</span>
                                <span>{dev.repeatedMistakes} repeated</span>
                            </div>
                        </div>
                        <span style={{ fontSize: '1.2rem' }}>{expandedDev === dev.githubLogin ? '▲' : '▼'}</span>
                    </div>

                    {expandedDev === dev.githubLogin && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="dev-details"
                            style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}
                        >
                            <div className="dev-areas">
                                {Object.keys(dev.weakAreas).length > 0 && (
                                    <div>
                                        <h4>Weak Areas</h4>
                                        <div className="area-tags">
                                            {Object.entries(dev.weakAreas)
                                                .sort((a, b) => b[1] - a[1])
                                                .map(([area, count]) => (
                                                    <span key={area} className="area-tag weak">
                                                        {area.replace(/_/g, ' ')} ({count}x)
                                                    </span>
                                                ))}
                                        </div>
                                    </div>
                                )}
                                {Object.keys(dev.strongAreas).length > 0 && (
                                    <div>
                                        <h4>Strong Areas</h4>
                                        <div className="area-tags">
                                            {Object.entries(dev.strongAreas)
                                                .sort((a, b) => b[1] - a[1])
                                                .map(([area, count]) => (
                                                    <span key={area} className="area-tag strong">
                                                        {area.replace(/_/g, ' ')} ({count}x)
                                                    </span>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {dev.lastReviewedAt && (
                                <p className="last-reviewed">
                                    Last reviewed: {new Date(dev.lastReviewedAt).toLocaleDateString()}
                                </p>
                            )}
                        </motion.div>
                    )}
                </div>
            ))}
        </div>
    )
}
