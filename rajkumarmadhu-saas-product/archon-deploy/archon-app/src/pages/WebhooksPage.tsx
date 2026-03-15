import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Webhook, Plus, Trash2, CheckCircle, XCircle, Copy } from 'lucide-react'
import { getWebhooks, createWebhook, deleteWebhook } from '../lib/api'

interface WebhookItem {
    id: string
    url: string
    events: string[]
    secret: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
}

const AVAILABLE_EVENTS = [
    'review.completed',
    'review.security_issue',
    'resolve.completed',
    'auto_review.started',
    'auto_review.completed',
    'risk.high_detected',
]

export default function WebhooksPage({ addToast }: { addToast: (t: any) => void }) {
    const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [newUrl, setNewUrl] = useState('')
    const [newSecret, setNewSecret] = useState('')
    const [selectedEvents, setSelectedEvents] = useState<string[]>([])
    const [creating, setCreating] = useState(false)

    const fetchWebhooks = async () => {
        try {
            const data = await getWebhooks()
            setWebhooks(data || [])
        } catch {
            addToast({ type: 'error', title: 'Failed to load webhooks' })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchWebhooks() }, [])

    const handleCreate = async () => {
        if (!newUrl.trim()) return
        setCreating(true)
        try {
            await createWebhook(newUrl.trim(), selectedEvents, newSecret.trim() || undefined)
            addToast({ type: 'success', title: 'Webhook created', message: 'Your webhook endpoint has been registered' })
            setNewUrl('')
            setNewSecret('')
            setSelectedEvents([])
            setShowCreate(false)
            fetchWebhooks()
        } catch {
            addToast({ type: 'error', title: 'Failed to create webhook' })
        } finally {
            setCreating(false)
        }
    }

    const handleDelete = async (hook: WebhookItem) => {
        if (!confirm(`Deactivate webhook for ${hook.url}?`)) return
        try {
            await deleteWebhook(hook.id)
            addToast({ type: 'success', title: 'Webhook deactivated' })
            fetchWebhooks()
        } catch {
            addToast({ type: 'error', title: 'Failed to deactivate webhook' })
        }
    }

    const toggleEvent = (event: string) => {
        setSelectedEvents(prev =>
            prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
        )
    }

    if (loading) {
        return (
            <div className="webhooks-page">
                <div className="section-header"><h2>Integration Webhooks</h2></div>
                <div className="loading-state">Loading webhooks...</div>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="webhooks-page"
        >
            <div className="section-header-row">
                <div>
                    <h2>Integration Webhooks</h2>
                    <p>Send Archon events to Slack, Jira, or any HTTP endpoint</p>
                </div>
                <button className="glow-btn" onClick={() => setShowCreate(!showCreate)}>
                    <Plus size={16} />
                    <span>Add Webhook</span>
                </button>
            </div>

            {/* Create Form */}
            <AnimatePresence>
                {showCreate && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="glass-card webhook-form"
                    >
                        <h3>New Webhook Endpoint</h3>
                        <div className="webhook-fields">
                            <div className="field">
                                <label>Endpoint URL</label>
                                <input
                                    type="url"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder="https://hooks.slack.com/services/..."
                                />
                            </div>
                            <div className="field">
                                <label>Secret (optional, for HMAC verification)</label>
                                <input
                                    type="text"
                                    value={newSecret}
                                    onChange={(e) => setNewSecret(e.target.value)}
                                    placeholder="whsec_..."
                                />
                            </div>
                            <div className="field">
                                <label>Events to subscribe</label>
                                <div className="event-checkboxes">
                                    {AVAILABLE_EVENTS.map(event => (
                                        <label key={event} className="checkbox-row">
                                            <input
                                                type="checkbox"
                                                checked={selectedEvents.includes(event)}
                                                onChange={() => toggleEvent(event)}
                                            />
                                            <span>{event}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button
                                className="glow-btn"
                                onClick={handleCreate}
                                disabled={creating || !newUrl.trim()}
                            >
                                {creating ? 'Creating...' : 'Create Webhook'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Webhooks List */}
            {webhooks.length === 0 ? (
                <div className="glass-card empty-state-card">
                    <Webhook size={48} className="icon-dim" />
                    <h3>No webhooks configured</h3>
                    <p>Add a webhook to send Archon events to your tools (Slack, Jira, etc.)</p>
                </div>
            ) : (
                <div className="webhooks-list">
                    {webhooks.map((hook, i) => (
                        <motion.div
                            key={hook.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="glass-card webhook-card"
                        >
                            <div className="webhook-header">
                                <div className="webhook-status">
                                    {hook.isActive ? (
                                        <CheckCircle size={16} className="icon-green" />
                                    ) : (
                                        <XCircle size={16} className="icon-dim" />
                                    )}
                                    <span className={hook.isActive ? 'active-text' : 'inactive-text'}>
                                        {hook.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                <button className="remove-btn" onClick={() => handleDelete(hook)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            <div className="webhook-url">
                                <code>{hook.url}</code>
                                <button className="copy-btn" onClick={() => {
                                    navigator.clipboard.writeText(hook.url)
                                    addToast({ type: 'info', title: 'URL copied' })
                                }}>
                                    <Copy size={14} />
                                </button>
                            </div>

                            {hook.events && hook.events.length > 0 && (
                                <div className="webhook-events">
                                    {hook.events.map((e: string) => (
                                        <span key={e} className="event-tag">{e}</span>
                                    ))}
                                </div>
                            )}

                            <div className="webhook-meta">
                                <span>Created {new Date(hook.createdAt).toLocaleDateString()}</span>
                                {hook.secret && <span className="has-secret">HMAC signed</span>}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </motion.div>
    )
}
