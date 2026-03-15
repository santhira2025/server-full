import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    CreditCard, Zap, Shield, Users, Check, AlertTriangle,
    ArrowRight, Settings, RefreshCw
} from 'lucide-react'
import {
    getBillingStatus, createCheckoutSession,
    createPortalSession, cancelSubscription, reactivateSubscription
} from '../lib/api'

interface BillingData {
    plan: {
        id: string
        name: string
        monthlyRequests: number
        priceMonthly: number
        privateRepos: boolean
    }
    usage: {
        used: number
        limit: number
        percentage: number
    }
    subscription: {
        id: string
        status: string
        currentPeriodEnd: number
        cancelAtPeriodEnd: boolean
    } | null
    stripeConfigured: boolean
    orgId: string
}

const PLAN_FEATURES: Record<string, string[]> = {
    free: [
        '50 reviews/month',
        'Public repos only',
        'Basic code review',
        'Community support',
    ],
    pro: [
        '500 reviews/month',
        'Private repos',
        'Inline PR comments',
        'Security scanning',
        'Developer coaching',
        'Priority support',
    ],
    team: [
        '2,000 reviews/month',
        'Private repos',
        'Auto-review PRs',
        'Team management',
        'Custom model routing',
        'Advanced coaching',
        'SLA guarantee',
    ],
}

export default function BillingPage() {
    const [billing, setBilling] = useState<BillingData | null>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const fetchBilling = async () => {
        try {
            const data = await getBillingStatus()
            setBilling(data)
            setError(null)
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load billing info')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchBilling()

        // Check for success/cancel params
        const params = new URLSearchParams(window.location.search)
        if (params.get('success') === 'true') {
            setSuccess('Subscription activated! Your plan has been upgraded.')
            window.history.replaceState({}, document.title, '/billing')
            // Refresh after short delay to get updated plan
            setTimeout(fetchBilling, 2000)
        }
        if (params.get('canceled') === 'true') {
            setError('Checkout was canceled. No changes were made.')
            window.history.replaceState({}, document.title, '/billing')
        }
    }, [])

    const handleUpgrade = async (planId: string) => {
        setActionLoading(planId)
        setError(null)
        try {
            const url = await createCheckoutSession(planId)
            window.location.href = url
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Failed to start checkout'
            setError(msg)
            setActionLoading(null)
        }
    }

    const handleManage = async () => {
        setActionLoading('portal')
        try {
            const url = await createPortalSession()
            window.location.href = url
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to open billing portal')
            setActionLoading(null)
        }
    }

    const handleCancel = async () => {
        if (!confirm('Cancel your subscription? You will keep access until the current period ends.')) return
        setActionLoading('cancel')
        try {
            await cancelSubscription()
            setSuccess('Subscription will cancel at the end of the billing period.')
            fetchBilling()
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to cancel subscription')
        } finally {
            setActionLoading(null)
        }
    }

    const handleReactivate = async () => {
        setActionLoading('reactivate')
        try {
            await reactivateSubscription()
            setSuccess('Subscription reactivated!')
            fetchBilling()
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to reactivate')
        } finally {
            setActionLoading(null)
        }
    }

    if (loading) {
        return (
            <div className="billing-page">
                <div className="billing-skeleton">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="glass-card skeleton-card" style={{ height: 200 }}>
                            <div className="skeleton skeleton-text-lg" />
                            <div className="skeleton skeleton-text-sm" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const currentPlanId = billing?.plan?.id || 'free'
    const hasSub = !!billing?.subscription
    const isCanceling = billing?.subscription?.cancelAtPeriodEnd

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="billing-page"
        >
            {/* Alerts */}
            {success && (
                <div className="billing-alert billing-alert-success">
                    <Check size={18} />
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}>&times;</button>
                </div>
            )}
            {error && (
                <div className="billing-alert billing-alert-error">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>&times;</button>
                </div>
            )}

            {/* Stripe Not Configured Banner */}
            {billing && !billing.stripeConfigured && (
                <div className="billing-alert billing-alert-warn">
                    <AlertTriangle size={18} />
                    <div>
                        <strong>Stripe not configured</strong>
                        <p>Add your <code>STRIPE_SECRET_KEY</code> to <code>.env</code> to enable paid plans. Products and prices are auto-created on first checkout.</p>
                    </div>
                </div>
            )}

            {/* Current Plan Summary */}
            <div className="billing-current glass-card">
                <div className="billing-current-info">
                    <div className="billing-current-plan">
                        <CreditCard size={22} className="icon-orange" />
                        <div>
                            <h3>Current Plan: <span className="plan-name-highlight">{billing?.plan?.name || 'Free'}</span></h3>
                            {hasSub && isCanceling && (
                                <span className="cancel-notice">Cancels at period end</span>
                            )}
                            {hasSub && billing?.subscription && (
                                <span className="billing-period">
                                    {isCanceling ? 'Access until' : 'Renews'}: {formatDate(billing.subscription.currentPeriodEnd)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="billing-current-actions">
                        {hasSub && !isCanceling && (
                            <>
                                <button
                                    className="billing-action-btn"
                                    onClick={handleManage}
                                    disabled={actionLoading === 'portal'}
                                >
                                    <Settings size={16} />
                                    {actionLoading === 'portal' ? 'Opening...' : 'Manage'}
                                </button>
                                <button
                                    className="billing-action-btn danger"
                                    onClick={handleCancel}
                                    disabled={actionLoading === 'cancel'}
                                >
                                    {actionLoading === 'cancel' ? 'Canceling...' : 'Cancel'}
                                </button>
                            </>
                        )}
                        {hasSub && isCanceling && (
                            <button
                                className="billing-action-btn glow-btn"
                                onClick={handleReactivate}
                                disabled={actionLoading === 'reactivate'}
                            >
                                <RefreshCw size={16} />
                                {actionLoading === 'reactivate' ? 'Reactivating...' : 'Reactivate'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Usage Bar */}
                {billing && (
                    <div className="usage-section">
                        <div className="usage-header">
                            <span className="usage-label">
                                <Zap size={14} />
                                Monthly Usage
                            </span>
                            <span className="usage-count">
                                {billing.usage.used} / {billing.usage.limit === -1 ? 'Unlimited' : billing.usage.limit}
                            </span>
                        </div>
                        <div className="usage-bar-track">
                            <motion.div
                                className={`usage-bar-fill ${billing.usage.percentage > 90 ? 'critical' : billing.usage.percentage > 70 ? 'warning' : ''}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(billing.usage.percentage, 100)}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                        </div>
                        {billing.usage.percentage > 80 && (
                            <span className="usage-warning">
                                {billing.usage.percentage >= 100
                                    ? 'Quota exceeded — upgrade to continue reviewing'
                                    : `${100 - billing.usage.percentage}% remaining this month`
                                }
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Plan Cards */}
            <div className="billing-plans-header">
                <h2>Choose Your Plan</h2>
                <p>All plans include core AI code review. Upgrade for more power.</p>
            </div>

            <div className="billing-plans-grid">
                <PlanCard
                    name="Free"
                    price={0}
                    features={PLAN_FEATURES.free}
                    current={currentPlanId === 'free'}
                    onUpgrade={() => {}}
                    disabled={true}
                    icon={<Shield size={24} />}
                />
                <PlanCard
                    name="Pro"
                    price={19}
                    features={PLAN_FEATURES.pro}
                    current={currentPlanId === 'pro'}
                    onUpgrade={() => handleUpgrade('pro')}
                    disabled={!billing?.stripeConfigured || currentPlanId === 'pro'}
                    loading={actionLoading === 'pro'}
                    icon={<Zap size={24} />}
                />
                <PlanCard
                    name="Team"
                    price={49}
                    features={PLAN_FEATURES.team}
                    current={currentPlanId === 'team'}
                    highlight
                    onUpgrade={() => handleUpgrade('team')}
                    disabled={!billing?.stripeConfigured || currentPlanId === 'team'}
                    loading={actionLoading === 'team'}
                    icon={<Users size={24} />}
                    badge="Popular"
                />
            </div>
        </motion.div>
    )
}

function PlanCard({ name, price, features, current, highlight, onUpgrade, disabled, loading, icon, badge }: {
    name: string
    price: number
    features: string[]
    current: boolean
    highlight?: boolean
    onUpgrade: () => void
    disabled: boolean
    loading?: boolean
    icon: React.ReactNode
    badge?: string
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass-card billing-plan-card ${highlight ? 'highlight' : ''} ${current ? 'current' : ''}`}
        >
            {badge && <span className="plan-badge-tag">{badge}</span>}
            <div className="plan-card-icon">{icon}</div>
            <h3 className="plan-card-name">{name}</h3>
            <div className="plan-price">
                <span className="amount">${price}</span>
                <span className="period">/mo</span>
            </div>
            <ul className="plan-features">
                {features.map((f, i) => (
                    <li key={i}>
                        <Check size={14} className="feature-check" />
                        {f}
                    </li>
                ))}
            </ul>
            <button
                className={`plan-btn ${highlight ? 'glow-btn' : ''}`}
                onClick={onUpgrade}
                disabled={disabled || loading}
            >
                {loading ? (
                    <span className="btn-loading">Processing...</span>
                ) : current ? (
                    'Current Plan'
                ) : price === 0 ? (
                    'Free Forever'
                ) : (
                    <>
                        Upgrade <ArrowRight size={16} />
                    </>
                )}
            </button>
        </motion.div>
    )
}

function formatDate(timestamp: number) {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
}
