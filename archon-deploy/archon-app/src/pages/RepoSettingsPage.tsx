import { useState, useEffect } from 'react'
import { getRepos, updateRepoSettings } from '../lib/api'
import { motion } from 'framer-motion'

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

const FOCUS_OPTIONS = ['security', 'bugs', 'style', 'performance']

export default function RepoSettingsPage() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    loadRepos()
  }, [])

  const loadRepos = async () => {
    try {
      setLoading(true)
      const data = await getRepos()
      setRepos(data)
    } catch (err) {
      console.error('Failed to load repos', err)
    } finally {
      setLoading(false)
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="repos-view"
    >
      <div className="section-header">
        <h2>Repositories</h2>
        <p>Configure auto-review and AI settings per repository</p>
      </div>

      {repos.length === 0 && (
        <div className="glass-card">
          <p className="empty-msg">No repositories found. Install the Archon GitHub App on your repos first.</p>
        </div>
      )}

      <div className="repos-grid">
        {repos.filter(r => r.isActive).map((repo) => (
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
    </motion.div>
  )
}
