import { useState, useEffect } from 'react'
import { getReviews } from '../lib/api'
import { motion } from 'framer-motion'

interface Review {
  id: string
  repo: string
  issueNumber: number
  actionType: string
  verdict: string | null
  summary: string | null
  inlineCommentsCount: number
  securityIssuesCount: number
  filesReviewed: number
  inputTokens: number
  outputTokens: number
  status: string
  createdAt: string
  resultData: any
}

const verdictColors: Record<string, string> = {
  APPROVE: '#10b981',
  REQUEST_CHANGES: '#ef4444',
  COMMENT: '#3b82f6',
}

export default function ReviewHistoryPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadReviews()
  }, [])

  const loadReviews = async () => {
    try {
      setLoading(true)
      const data = await getReviews()
      setReviews(data)
    } catch (err) {
      console.error('Failed to load reviews', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="reviews-view"
    >
      <div className="section-header">
        <h2>Review History</h2>
        <p>Browse past code reviews and analysis results</p>
      </div>

      <div className="glass-card">
        {loading && <p className="loading-msg">Loading reviews...</p>}

        {!loading && reviews.length === 0 && (
          <p className="empty-msg">No reviews yet. Use /archon review on a PR to get started!</p>
        )}

        <div className="reviews-list">
          {reviews.map((review) => (
            <div key={review.id} className="review-item">
              <div
                className="review-header"
                onClick={() => setExpandedId(expandedId === review.id ? null : review.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="review-left">
                  {review.verdict && (
                    <span
                      className="verdict-badge"
                      style={{ backgroundColor: verdictColors[review.verdict] || '#888' }}
                    >
                      {review.verdict}
                    </span>
                  )}
                  <span className="review-repo">{review.repo}</span>
                  <span className="review-issue">#{review.issueNumber}</span>
                  <span className="review-type">{review.actionType}</span>
                  {review.resultData?.intentAnalysis && !review.resultData.intentAnalysis.matches && (
                    <span className="feature-badge intent-badge">Intent Mismatch</span>
                  )}
                  {review.resultData?.aiPatternAnalysis?.detected && (
                    <span className="feature-badge ai-badge">AI Patterns</span>
                  )}
                </div>
                <div className="review-right">
                  <span className="review-stat">
                    {review.filesReviewed} files | {review.inlineCommentsCount} comments
                    {review.securityIssuesCount > 0 && ` | ${review.securityIssuesCount} security`}
                  </span>
                  <span className="review-time">
                    {new Date(review.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {review.summary && (
                <p className="review-summary">{review.summary}</p>
              )}

              {expandedId === review.id && review.resultData && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="review-details"
                >
                  <div className="review-tokens">
                    Tokens: {review.inputTokens.toLocaleString()} in / {review.outputTokens.toLocaleString()} out
                  </div>

                  {review.resultData.intentAnalysis && (
                    <div className="intent-section">
                      <h4>
                        {review.resultData.intentAnalysis.matches ? '✅' : review.resultData.intentAnalysis.score >= 70 ? '⚠️' : '❌'}
                        {' '}Intent Validation
                        <span className={`intent-score ${review.resultData.intentAnalysis.score >= 90 ? 'good' : review.resultData.intentAnalysis.score >= 70 ? 'warn' : 'bad'}`}>
                          {review.resultData.intentAnalysis.score}/100
                        </span>
                      </h4>
                      {review.resultData.intentAnalysis.linkedIssue && (
                        <p className="intent-linked">
                          Linked: #{review.resultData.intentAnalysis.linkedIssue.number} — {review.resultData.intentAnalysis.linkedIssue.title}
                        </p>
                      )}
                      {review.resultData.intentAnalysis.mismatches?.length > 0 && (
                        <div className="mismatches-list">
                          {review.resultData.intentAnalysis.mismatches.map((m: any, i: number) => (
                            <div key={i} className="mismatch-item">
                              <span className={`mismatch-status status-${m.status}`}>{m.status}</span>
                              <strong>{m.requirement}</strong>
                              <p>{m.explanation}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {review.resultData.aiPatternAnalysis?.detected && (
                    <div className="ai-audit-section">
                      <h4>
                        ⚠️ AI Code Patterns
                        <span className="ai-confidence">
                          {review.resultData.aiPatternAnalysis.confidence}% confidence
                        </span>
                      </h4>
                      <div className="ai-patterns-list">
                        {review.resultData.aiPatternAnalysis.patterns.map((p: any, i: number) => (
                          <div key={i} className="ai-pattern-item">
                            <span className={`severity-badge severity-${p.severity}`}>
                              {p.severity.toUpperCase()}
                            </span>
                            <span className="pattern-type">{p.pattern}</span>
                            <code>{p.file}:{p.line}</code>
                            <p>{p.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {review.resultData.inlineComments?.length > 0 && (
                    <div className="inline-comments-section">
                      <h4>Inline Comments</h4>
                      {review.resultData.inlineComments.map((c: any, i: number) => (
                        <div key={i} className="inline-comment">
                          <code>{c.path}:{c.line}</code>
                          <p>{c.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {review.resultData.securityIssues?.length > 0 && (
                    <div className="security-section">
                      <h4>Security Issues</h4>
                      {review.resultData.securityIssues.map((s: any, i: number) => (
                        <div key={i} className="security-issue">
                          <span className={`severity-badge severity-${s.severity}`}>
                            {s.severity.toUpperCase()}
                          </span>
                          <code>{s.file}:{s.line}</code>
                          <p>{s.description}</p>
                          <p className="recommendation">Fix: {s.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
