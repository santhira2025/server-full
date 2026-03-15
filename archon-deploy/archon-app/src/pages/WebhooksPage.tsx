import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Webhook, Plus, Trash2, CheckCircle, XCircle, Copy, Send, RefreshCw, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { getWebhooks, createWebhook, deleteWebhook, testWebhook, getWebhookDeliveries, retryWebhookDelivery } from '../lib/api'

interface WebhookItem {
    id: string
    url: string
    events: string[]
    secret: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
}

interface Delivery {
    id: string
    event: string
    status: string
    statusCode: number | null
    duration: number | null
    error: string | null
    attempts: number
    createdAt: string
}

const AVAILABLE_EVENTS = [
    'review.completed',
    'review.security_issue',
    'resolve.completed',
    'auto_review.started',
    'auto_review.completed',
    'risk.high_detected',
]

const TEMPLATES = [
    {
        name: 'Slack',
        icon: '💬',
        placeholder: 'https://hooks.slack.com/services/T.../B.../...',
        hint: 'From Slack: Apps → Incoming Webhooks → Add new webhook',
        events: ['review.completed', 'review.security_issue', 'risk.high_detected'],
    },
    {
        name: 'Discord',
        icon: '🎮',
        placeholder: 'https://discord.com/api/webhooks/...',
        hint: 'From Discord: Channel Settings → Integrations → Webhooks',
        events: ['review.completed', 'auto_review.completed', 'risk.high_detected'],
    },
    {
        name: 'Teams',
        icon: '🏢',
        placeholder: 'https://outlook.office.com/webhook/...',
        hint: 'From Teams: Channel → Connectors → Incoming Webhook',
        events: ['review.completed', 'review.security_issue'],
    },
]

export default function WebhooksPage({ addToast }: { addToast: (t: any) => void }) {
    const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [newUrl, setNewUrl] = useState('')
    const [newSecret, setNewSecret] = useState('')
    const [selectedEvents, setSelectedEvents] = useState<string[]>([])
    const [creating, setCreating] = useState(false)
    const [expandedDeliveries, setExpandedDeliveries] = useState<string | null>(null)
    const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({})
    const [loadingDeliveries, setLoadingDeliveries] = useState<string | null>(null)
    const [testingWebhook, setTestingWebhook] = useState<string | null>(null)
    const [retryingDelivery, setRetryingDelivery] = useState<string | null>(null)
    const [activeTemplate, setActiveTemplate] = useState<string | null>(null)

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
            setActiveTemplate(null)
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

    const handleTest = async (hook: WebhookItem) => {
        setTestingWebhook(hook.id)
        try {
            const result = await testWebhook(hook.id)
            if (result.success) {
                addToast({ type: 'success', title: 'Test delivered', message: `HTTP ${result.statusCode} from ${hook.url}` })
            } else {
                addToast({ type: 'error', title: 'Test failed', message: result.error || `HTTP ${result.statusCode}` })
            }
            // Refresh deliveries if expanded
            if (expandedDeliveries === hook.id) {
                loadDeliveries(hook.id)
            }
        } catch {
            addToast({ type: 'error', title: 'Test failed' })
        } finally {
            setTestingWebhook(null)
        }
    }

    const loadDeliveries = async (hookId: string) => {
        setLoadingDeliveries(hookId)
        try {
            const data = await getWebhookDeliveries(hookId)
            setDeliveries(prev => ({ ...prev, [hookId]: data || [] }))
        } catch {
            addToast({ type: 'error', title: 'Failed to load delivery logs' })
        } finally {
            setLoadingDeliveries(null)
        }
    }

    const toggleDeliveries = (hookId: string) => {
        if (expandedDeliveries === hookId) {
            setExpandedDeliveries(null)
        } else {
            setExpandedDeliveries(hookId)
            if (!deliveries[hookId]) {
                loadDeliveries(hookId)
            }
        }
    }

    const handleRetry = async (hookId: string, deliveryId: string) => {
        setRetryingDelivery(deliveryId)
        try {
            await retryWebhookDelivery(hookId, deliveryId)
            addToast({ type: 'success', title: 'Retry queued' })
            loadDeliveries(hookId)
        } catch {
            addToast({ type: 'error', title: 'Retry failed' })
        } finally {
            setRetryingDelivery(null)
        }
    }

    const toggleEvent = (event: string) => {
        setSelectedEvents(prev =>
            prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
        )
    }

    const applyTemplate = (template: typeof TEMPLATES[0]) => {
        setActiveTemplate(template.name)
        setSelectedEvents(template.events)
        setNewUrl('')
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

                        {/* Templates */}
                        <div className="webhook-templates">
                            <p className="template-label">Quick templates:</p>
                            <div className="template-btns">
                                {TEMPLATES.map(tpl => (
                                    <button
                                        key={tpl.name}
                                        className={`template-btn ${activeTemplate === tpl.name ? 'active' : ''}`}
                                        onClick={() => applyTemplate(tpl)}
                                    >
                                        {tpl.icon} {tpl.name}
                                    </button>
                                ))}
                            </div>
                            {activeTemplate && (
                                <p className="template-hint">
                                    {TEMPLATES.find(t => t.name === activeTemplate)?.hint}
                                </p>
                            )}
                        </div>

                        <div className="webhook-fields">
                            <div className="field">
                                <label>Endpoint URL</label>
                                <input
                                    type="url"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder={
                                        activeTemplate
                                            ? TEMPLATES.find(t => t.name === activeTemplate)?.placeholder || 'https://...'
                                            : 'https://hooks.slack.com/services/...'
                                    }
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
                                <div className="webhook-actions">
                                    <button
                                        className="action-btn"
                                        onClick={() => handleTest(hook)}
                                        disabled={testingWebhook === hook.id}
                                        title="Send test event"
                                    >
                                        <Send size={14} />
                                        <span>{testingWebhook === hook.id ? 'Sending...' : 'Test'}</span>
                                    </button>
                                    <button className="remove-btn" onClick={() => handleDelete(hook)}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
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
                                <button
                                    className="deliveries-toggle"
                                    onClick={() => toggleDeliveries(hook.id)}
                                >
                                    <Clock size={12} />
                                    <span>Delivery logs</span>
                                    {expandedDeliveries === hook.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                            </div>

                            {/* Delivery Logs */}
                            <AnimatePresence>
                                {expandedDeliveries === hook.id && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="delivery-logs"
                                    >
                                        {loadingDeliveries === hook.id ? (
                                            <div className="delivery-loading">Loading deliveries...</div>
                                        ) : (deliveries[hook.id] || []).length === 0 ? (
                                            <div className="delivery-empty">No deliveries yet. Click "Test" to send a test event.</div>
                                        ) : (
                                            <div className="delivery-table">
                                                <div className="delivery-header-row">
                                                    <span>Event</span>
                                                    <span>Status</span>
                                                    <span>Duration</span>
                                                    <span>Time</span>
                                                    <span></span>
                                                </div>
                                                {(deliveries[hook.id] || []).map(d => (
                                                    <div key={d.id} className="delivery-row">
                                                        <span className="delivery-event">{d.event}</span>
                                                        <span className={`delivery-status ${d.status}`}>
                                                            {d.status === 'success' ? (
                                                                <CheckCircle size={12} />
                                                            ) : (
                                                                <XCircle size={12} />
                                                            )}
                                                            {d.statusCode ? ` ${d.statusCode}` : d.status}
                                                        </span>
                                                        <span className="delivery-duration">
                                                            {d.duration ? `${d.duration}ms` : '—'}
                                                        </span>
                                                        <span className="delivery-time">
                                                            {new Date(d.createdAt).toLocaleTimeString()}
                                                        </span>
                                                        {d.status === 'failed' && (
                                                            <button
                                                                className="retry-btn"
                                                                onClick={() => handleRetry(hook.id, d.id)}
                                                                disabled={retryingDelivery === d.id}
                                                            >
                                                                <RefreshCw size={12} />
                                                                {retryingDelivery === d.id ? 'Retrying...' : 'Retry'}
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            )}
        </motion.div>
    )
}
