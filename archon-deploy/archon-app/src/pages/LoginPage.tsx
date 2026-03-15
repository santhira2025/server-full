import { motion } from 'framer-motion'
import {
    Github,
    Shield,
    Zap,
    Brain,
    ArrowRight,
    Code2,
    Sparkles,
    Lock,
    GitMerge,
    Scan,
    TrendingUp,
} from 'lucide-react'
import './LoginPage.css'

interface LoginPageProps {
    onLogin: () => void
}

/* Inline SVG AI Brain Illustration */
function AiBrainSvg() {
    return (
        <svg viewBox="0 0 400 400" className="lp-hero-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
                <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ec4899" />
                    <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>

            {/* Background circles */}
            <circle cx="200" cy="200" r="150" fill="none" stroke="url(#grad1)" strokeWidth="0.5" opacity="0.3">
                <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="360 200 200" dur="30s" repeatCount="indefinite" />
            </circle>
            <circle cx="200" cy="200" r="120" fill="none" stroke="url(#grad2)" strokeWidth="0.5" opacity="0.25">
                <animateTransform attributeName="transform" type="rotate" from="360 200 200" to="0 200 200" dur="25s" repeatCount="indefinite" />
            </circle>
            <circle cx="200" cy="200" r="90" fill="none" stroke="url(#grad3)" strokeWidth="0.5" opacity="0.2">
                <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="360 200 200" dur="20s" repeatCount="indefinite" />
            </circle>

            {/* Neural network nodes */}
            {/* Center brain */}
            <circle cx="200" cy="200" r="36" fill="url(#grad1)" opacity="0.15" />
            <circle cx="200" cy="200" r="24" fill="url(#grad1)" opacity="0.25" />
            <circle cx="200" cy="200" r="8" fill="url(#grad1)" filter="url(#glow)">
                <animate attributeName="r" values="8;10;8" dur="2s" repeatCount="indefinite" />
            </circle>

            {/* Orbiting nodes */}
            <g>
                <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="360 200 200" dur="12s" repeatCount="indefinite" />
                <circle cx="200" cy="80" r="6" fill="#6366f1" filter="url(#glow)" />
                <line x1="200" y1="86" x2="200" y2="176" stroke="#6366f1" strokeWidth="1" opacity="0.3" />
            </g>
            <g>
                <animateTransform attributeName="transform" type="rotate" from="120 200 200" to="480 200 200" dur="15s" repeatCount="indefinite" />
                <circle cx="200" cy="70" r="5" fill="#ec4899" filter="url(#glow)" />
                <line x1="200" y1="75" x2="200" y2="176" stroke="#ec4899" strokeWidth="1" opacity="0.25" />
            </g>
            <g>
                <animateTransform attributeName="transform" type="rotate" from="240 200 200" to="600 200 200" dur="18s" repeatCount="indefinite" />
                <circle cx="200" cy="75" r="5" fill="#10b981" filter="url(#glow)" />
                <line x1="200" y1="80" x2="200" y2="176" stroke="#10b981" strokeWidth="1" opacity="0.25" />
            </g>

            {/* Outer data points */}
            <g opacity="0.6">
                <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="-360 200 200" dur="22s" repeatCount="indefinite" />
                <circle cx="320" cy="200" r="4" fill="#f59e0b" />
                <circle cx="80" cy="200" r="3" fill="#06b6d4" />
                <circle cx="260" cy="100" r="3.5" fill="#a855f7" />
                <circle cx="140" cy="300" r="3" fill="#ec4899" />
                <circle cx="140" cy="100" r="3.5" fill="#10b981" />
                <circle cx="260" cy="300" r="3" fill="#6366f1" />
            </g>

            {/* Connection lines */}
            <g opacity="0.12" stroke="url(#grad1)" strokeWidth="0.8">
                <line x1="200" y1="200" x2="320" y2="120" />
                <line x1="200" y1="200" x2="80" y2="280" />
                <line x1="200" y1="200" x2="300" y2="300" />
                <line x1="200" y1="200" x2="100" y2="120" />
                <line x1="200" y1="200" x2="320" y2="250" />
                <line x1="200" y1="200" x2="80" y2="150" />
            </g>

            {/* Floating code brackets */}
            <text x="310" y="135" fill="#6366f1" fontSize="18" fontFamily="monospace" fontWeight="bold" opacity="0.5">
                {"{ }"}
                <animateTransform attributeName="transform" type="translate" values="0,0; 0,-6; 0,0" dur="3s" repeatCount="indefinite" />
            </text>
            <text x="65" y="165" fill="#ec4899" fontSize="16" fontFamily="monospace" fontWeight="bold" opacity="0.4">
                {"</>"}
                <animateTransform attributeName="transform" type="translate" values="0,0; 0,5; 0,0" dur="4s" repeatCount="indefinite" />
            </text>
            <text x="290" y="300" fill="#10b981" fontSize="14" fontFamily="monospace" fontWeight="bold" opacity="0.4">
                {"fn()"}
                <animateTransform attributeName="transform" type="translate" values="0,0; 0,-4; 0,0" dur="3.5s" repeatCount="indefinite" />
            </text>

            {/* Pulse rings */}
            <circle cx="200" cy="200" r="50" fill="none" stroke="url(#grad1)" strokeWidth="0.5" opacity="0">
                <animate attributeName="r" values="30;80" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="200" cy="200" r="50" fill="none" stroke="url(#grad2)" strokeWidth="0.5" opacity="0">
                <animate attributeName="r" values="30;100" dur="4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0" dur="4s" repeatCount="indefinite" />
            </circle>
        </svg>
    )
}

function LoginPage({ onLogin }: LoginPageProps) {
    const features = [
        { icon: Brain, title: 'AI-Powered Reviews', desc: 'Deep code analysis powered by advanced AI models', color: '#6366f1', bg: '#eef2ff' },
        { icon: Zap, title: 'Instant Feedback', desc: 'Review comments on every PR in under 30 seconds', color: '#f59e0b', bg: '#fffbeb' },
        { icon: Shield, title: 'Security Scanning', desc: 'OWASP top 10, secrets detection, XSS & SQLi', color: '#10b981', bg: '#ecfdf5' },
        { icon: Sparkles, title: 'Developer Coaching', desc: 'Personalized growth tracking for every developer', color: '#ec4899', bg: '#fdf2f8' },
    ]

    return (
        <div className="lp">
            {/* Background mesh */}
            <div className="lp-mesh" />
            <div className="lp-shape lp-shape-1" />
            <div className="lp-shape lp-shape-2" />
            <div className="lp-shape lp-shape-3" />
            <div className="lp-shape lp-shape-4" />

            {/* Top nav */}
            <motion.nav
                className="lp-nav"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
            >
                <div className="lp-nav-left">
                    <div className="lp-logo">
                        <Code2 size={20} strokeWidth={2.5} />
                    </div>
                    <span className="lp-brand-name">Archon</span>
                </div>
                <button className="lp-nav-btn" onClick={onLogin}>
                    Sign In
                    <ArrowRight size={14} />
                </button>
            </motion.nav>

            <div className="lp-grid">
                {/* Left — Hero content */}
                <motion.div
                    className="lp-left"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                    {/* Badge */}
                    <motion.div
                        className="lp-badge"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                    >
                        <Sparkles size={14} />
                        <span>AI-Powered Code Review Platform</span>
                    </motion.div>

                    <h1 className="lp-title">
                        Review Code
                        <br />
                        <span className="lp-title-grad">10x Faster</span>
                        <br />
                        with AI
                    </h1>

                    <p className="lp-desc">
                        Archon automatically reviews every pull request — catching bugs, security vulnerabilities, and coaching developers to write cleaner, safer code.
                    </p>

                    {/* CTA buttons */}
                    <div className="lp-ctas">
                        <button className="lp-btn-primary" onClick={onLogin}>
                            <Github size={20} />
                            <span>Get Started Free</span>
                            <ArrowRight size={16} className="lp-btn-arrow" />
                        </button>
                        <div className="lp-btn-sub">
                            <Lock size={12} />
                            No credit card required
                        </div>
                    </div>

                    {/* Stats row */}
                    <motion.div
                        className="lp-stats-row"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                    >
                        <div className="lp-stat-item">
                            <GitMerge size={18} className="lp-stat-icon" style={{ color: '#6366f1' }} />
                            <div>
                                <div className="lp-stat-val">10,000+</div>
                                <div className="lp-stat-lbl">PRs Reviewed</div>
                            </div>
                        </div>
                        <div className="lp-stat-divider" />
                        <div className="lp-stat-item">
                            <Scan size={18} className="lp-stat-icon" style={{ color: '#10b981' }} />
                            <div>
                                <div className="lp-stat-val">5,200+</div>
                                <div className="lp-stat-lbl">Bugs Caught</div>
                            </div>
                        </div>
                        <div className="lp-stat-divider" />
                        <div className="lp-stat-item">
                            <TrendingUp size={18} className="lp-stat-icon" style={{ color: '#f59e0b' }} />
                            <div>
                                <div className="lp-stat-val">99.9%</div>
                                <div className="lp-stat-lbl">Uptime</div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>

                {/* Right — Visual + Card */}
                <motion.div
                    className="lp-right"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                >
                    {/* AI Hero Illustration */}
                    <div className="lp-hero-visual">
                        <AiBrainSvg />

                        {/* Floating feature cards over the illustration */}
                        <motion.div
                            className="lp-float-card lp-float-1"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.6, duration: 0.5 }}
                        >
                            <div className="lp-fc-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><Brain size={16} /></div>
                            <div>
                                <div className="lp-fc-title">AI Review</div>
                                <div className="lp-fc-val lp-fc-green">12 issues found</div>
                            </div>
                        </motion.div>

                        <motion.div
                            className="lp-float-card lp-float-2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.75, duration: 0.5 }}
                        >
                            <div className="lp-fc-icon" style={{ background: '#ecfdf5', color: '#10b981' }}><Shield size={16} /></div>
                            <div>
                                <div className="lp-fc-title">Security</div>
                                <div className="lp-fc-val" style={{ color: '#10b981' }}>All Clear</div>
                            </div>
                        </motion.div>

                        <motion.div
                            className="lp-float-card lp-float-3"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.9, duration: 0.5 }}
                        >
                            <div className="lp-fc-icon" style={{ background: '#fdf2f8', color: '#ec4899' }}><TrendingUp size={16} /></div>
                            <div>
                                <div className="lp-fc-title">Team Score</div>
                                <div className="lp-fc-val" style={{ color: '#ec4899' }}>94 / 100</div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Feature grid */}
                    <div className="lp-feat-grid">
                        {features.map((f, i) => (
                            <motion.div
                                key={f.title}
                                className="lp-feat-card"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 + i * 0.08, duration: 0.4 }}
                            >
                                <div className="lp-feat-icon" style={{ background: f.bg, color: f.color }}>
                                    <f.icon size={18} />
                                </div>
                                <div className="lp-feat-title">{f.title}</div>
                                <div className="lp-feat-desc">{f.desc}</div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    )
}

export default LoginPage
