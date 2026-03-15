import { useState, useEffect } from 'react'
import { getRepos, updateRepoSettings, getOrgRepos } from '../lib/api'
import { useOrg } from '../context/OrgContext'
import { motion } from 'framer-motion'
import { RefreshCw, ExternalLink } from 'lucide-react'

interface Repo {
  id: string
  fullName: string
  isActive: boolean
  settings: {
    autoReview?: boolean
    autoReviewFocus?: string[]
    securityScan?: boolean
    autoTriage?: boolean
    enableIntentValidation?: boolean
    enableAIAudit?: boolean
    model?: string
  }
}

interface AvailableRepo {
  id: string
  fullName: string
  private: boolean
  language: string | null
  updatedAt: string | null
  hasAppInstalled: boolean
}

const FOCUS_OPTIONS = ['security', 'bugs', 'style', 'performance']

export default function RepoSettingsPage() {
  const { currentOrg } = useOrg()
  const [repos, setRepos] = useState<Repo[]>([])
  const [availableRepos, setAvailableRepos] = useState<AvailableRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    loadRepos()
  }, [currentOrg?.id])

  const loadRepos = async () => {
    try {
      setLoading(true)
      const data = await getRepos()
      setRepos(data)

      // Also fetch available repos from GitHub if we have an org
      if (currentOrg?.id) {
        try {
          const orgData = await getOrgRepos(currentOrg.id)
          setAvailableRepos(orgData.availableRepos || [])
        } catch {
          // Non-fatal
        }
      }
    } catch (err) {
      console.error('Failed to load repos', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      if (currentOrg?.id) {
        const orgData = await getOrgRepos(currentOrg.id)
        setAvailableRepos(orgData.availableRepos || [])
        // Refresh installed repos too
        const data = await getRepos()
        setRepos(data)
      }
    } catch (err) {
      console.error('Failed to sync repos', err)
    } finally {
      setSyncing(false)
    }
  }

  const handleToggle = async (repo: Repo, key: string, value: boolean) => {
    const newSettings = { ...repo.settings, [key]: value }
    setSaving(repo.id)
    try {
      await updateRepoSettings(repo.id, newSettings)
      setRepos(prev =>
        prev.map(r => r.id === repo.id ? { ...r, settings: newSettings } : r)
      )
    } catch (err) {
      console.error('Failed to update settings', err)
    } finally {
      setSaving(null)
    }
  }

  const handleFocusChange = async (repo: Repo, focus: string, checked: boolean) => {
    const current = repo.settings.autoReviewFocus || FOCUS_OPTIONS
    const newFocus = checked
      ? [...current, focus]
      : current.filter(f => f !== focus)
    const newSettings = { ...repo.settings, autoReviewFocus: newFocus }
    setSaving(repo.id)
    try {
      await updateRepoSettings(repo.id, newSettings)
      setRepos(prev =>
        prev.map(r => r.id === repo.id ? { ...r, settings: newSettings } : r)
      )
    } catch (err) {
      console.error('Failed to update focus', err)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="events-view">
        <div className="section-header">
          <h2>Repositories</h2>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  const activeRepos = repos.filter(r => r.isActive)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="repos-view"
    >
      <div className="section-header">
        <div>
          <h2>Repositories</h2>
          <p>Configure auto-review and AI settings per repository</p>
        </div>
        <button
          className="glow-btn"
          onClick={handleSync}
          disabled={syncing}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} className={syncing ? 'spinning' : ''} />
          <span>Sync from GitHub</span>
        </button>
      </div>

      {/* Active Repos (App installed) */}
      {activeRepos.length > 0 && (
        <>
          <h3 style={{ margin: '24px 0 16px', fontSize: 16, color: 'var(--text-main)' }}>
            Active Repos
          </h3>
          <div className="repos-grid">
            {activeRepos.map((repo) => (
              <div key={repo.id} className="glass-card repo-card">
                <div className="repo-header">
                  <h3>{repo.fullName}</h3>
                  {saving === repo.id && <span className="saving-indicator">Saving...</span>}
                </div>

                <div className="repo-settings">
                  <label className="toggle-row">
                    <span>Auto-review PRs</span>
                    <input
                      type="checkbox"
                      checked={repo.settings.autoReview || false}
                      onChange={(e) => handleToggle(repo, 'autoReview', e.target.checked)}
                    />
                  </label>

                  <label className="toggle-row">
                    <span>Security Scan</span>
                    <input
                      type="checkbox"
                      checked={repo.settings.securityScan || false}
                      onChange={(e) => handleToggle(repo, 'securityScan', e.target.checked)}
                    />
                  </label>

                  <label className="toggle-row">
                    <span>Auto-triage Issues</span>
                    <input
                      type="checkbox"
                      checked={repo.settings.autoTriage || false}
                      onChange={(e) => handleToggle(repo, 'autoTriage', e.target.checked)}
                    />
                  </label>

                  <div className="settings-divider" />

                  <label className="toggle-row">
                    <span>Intent Validator</span>
                    <input
                      type="checkbox"
                      checked={repo.settings.enableIntentValidation !== false}
                      onChange={(e) => handleToggle(repo, 'enableIntentValidation', e.target.checked)}
                    />
                  </label>
                  <p className="setting-hint">Checks if PR code matches the linked issue requirements</p>

                  <label className="toggle-row">
                    <span>AI Code Auditor</span>
                    <input
                      type="checkbox"
                      checked={repo.settings.enableAIAudit !== false}
                      onChange={(e) => handleToggle(repo, 'enableAIAudit', e.target.checked)}
                    />
                  </label>
                  <p className="setting-hint">Detects AI-generated code patterns that need human review</p>

                  {repo.settings.autoReview && (
                    <div className="focus-options">
                      <p className="focus-label">Review Focus:</p>
                      {FOCUS_OPTIONS.map((focus) => (
                        <label key={focus} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={(repo.settings.autoReviewFocus || FOCUS_OPTIONS).includes(focus)}
                            onChange={(e) => handleFocusChange(repo, focus, e.target.checked)}
                          />
                          <span>{focus.charAt(0).toUpperCase() + focus.slice(1)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Available Repos (no App installed) */}
      {availableRepos.length > 0 && (
        <>
          <h3 style={{ margin: '32px 0 16px', fontSize: 16, color: 'var(--text-main)' }}>
            Available Repos
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
              Install the Archon GitHub App to enable reviews
            </span>
          </h3>
          <div className="repos-grid">
            {availableRepos.map((repo) => (
              <div key={repo.id} className="glass-card repo-card" style={{ opacity: 0.7 }}>
                <div className="repo-header">
                  <h3>{repo.fullName}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {repo.language && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{repo.language}</span>
                    )}
                    {repo.private && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: 4 }}>
                        Private
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ padding: '12px 0' }}>
                  <a
                    href="https://github.com/apps/archon-org"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      color: 'var(--primary)',
                    }}
                  >
                    <ExternalLink size={14} />
                    Install Archon App
                  </a>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeRepos.length === 0 && availableRepos.length === 0 && (
        <div className="glass-card">
          <p className="empty-msg">No repositories found. Install the Archon GitHub App on your repos first.</p>
        </div>
      )}
    </motion.div>
  )
}
