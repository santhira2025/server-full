import { useState, useRef, useEffect } from 'react'
import { ChevronDown, RefreshCw, Building2, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrg } from '../context/OrgContext'

export default function OrgSelector() {
  const { orgs, currentOrg, loading, switchOrg, refreshOrgs } = useOrg()
  const [open, setOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setSyncing(true)
    try {
      await refreshOrgs()
    } finally {
      setSyncing(false)
    }
  }

  if (loading && orgs.length === 0) {
    return (
      <div className="org-selector-wrapper">
        <div className="org-selector-trigger">
          <div className="org-avatar-placeholder" />
          <span className="org-name">Loading...</span>
        </div>
      </div>
    )
  }

  if (!currentOrg) return null

  return (
    <div className="org-selector-wrapper" ref={ref}>
      <button className="org-selector-trigger" onClick={() => setOpen(!open)}>
        {currentOrg.avatarUrl ? (
          <img src={currentOrg.avatarUrl} alt={currentOrg.githubLogin} className="org-avatar" />
        ) : (
          <div className="org-avatar-placeholder">
            {currentOrg.type === 'Organization' ? <Building2 size={16} /> : <User size={16} />}
          </div>
        )}
        <div className="org-trigger-info">
          <span className="org-name">{currentOrg.githubLogin}</span>
          <span className="org-type-badge">
            {currentOrg.type === 'Organization' ? 'Org' : 'Personal'}
          </span>
        </div>
        <ChevronDown size={16} className={`org-chevron ${open ? 'rotated' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="org-dropdown"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <div className="org-dropdown-header">
              <span>Switch organization</span>
              <button
                className="org-sync-btn"
                onClick={handleSync}
                disabled={syncing}
                title="Sync from GitHub"
              >
                <RefreshCw size={14} className={syncing ? 'spinning' : ''} />
              </button>
            </div>
            {orgs.map((org) => (
              <button
                key={org.id}
                className={`org-dropdown-item ${org.id === currentOrg.id ? 'active' : ''}`}
                onClick={() => {
                  if (org.id !== currentOrg.id) {
                    switchOrg(org.id)
                  }
                  setOpen(false)
                }}
              >
                {org.avatarUrl ? (
                  <img src={org.avatarUrl} alt={org.githubLogin} className="org-avatar-sm" />
                ) : (
                  <div className="org-avatar-placeholder-sm">
                    {org.type === 'Organization' ? <Building2 size={14} /> : <User size={14} />}
                  </div>
                )}
                <div className="org-item-info">
                  <span className="org-item-name">{org.githubLogin}</span>
                  <span className="org-item-meta">
                    {org.type === 'Organization' ? 'Org' : 'Personal'}
                    {!org.hasAppInstalled && ' · No app'}
                  </span>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
