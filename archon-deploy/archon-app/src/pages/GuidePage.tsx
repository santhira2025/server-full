import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './GuidePage.css'
import {
  MessageSquare, Shield, Brain, Wrench, Search, GitBranch,
  Zap, BookOpen, ChevronDown, ChevronRight, Terminal,
  Copy, Check, AlertTriangle, Sparkles, Target, BarChart3,
  Webhook, Tag, Settings, Lock, ArrowRight, ExternalLink,
  FileText, TestTube, ScrollText
} from 'lucide-react'

const commands = [
  {
    cmd: '/archon review',
    alias: '/ac review',
    icon: <MessageSquare size={20} />,
    color: '#ff6b00',
    where: 'PR comments',
    short: 'Full AI code review with inline comments',
    detail: [
      'Fetches entire PR diff + loads project memory',
      'Posts PR Summary with Mermaid diagram & risk score',
      'Inline comments with severity: critical, warning, suggestion, info',
      'One-click fix suggestions (GitHub suggestion blocks)',
      'Intent validation — checks PR matches the linked issue',
      'AI pattern audit — detects AI-generated code',
      'Developer coaching summary appended',
      'Verdict: APPROVE, REQUEST_CHANGES, or COMMENT',
    ],
  },
  {
    cmd: '/archon security',
    alias: '/ac security',
    icon: <Shield size={20} />,
    color: '#ef4444',
    where: 'PR comments',
    short: 'Security vulnerability scan (OWASP Top 10)',
    detail: [
      'SQL injection, XSS, CSRF, hardcoded secrets',
      'Insecure crypto, path traversal, command injection',
      'Insecure deserialization detection',
      'Severity levels: critical, high, medium, low',
      'Auto REQUEST_CHANGES on critical/high findings',
      'One-click fix suggestions included',
    ],
  },
  {
    cmd: '/archon explain',
    alias: '/ac explain',
    icon: <BookOpen size={20} />,
    color: '#8b5cf6',
    where: 'PR or Issue',
    short: 'Explain code in plain English',
    detail: [
      'What the code does and why',
      'Architecture and design patterns used',
      'Edge cases to watch for',
      'Great for onboarding new team members',
    ],
  },
  {
    cmd: '/archon resolve',
    alias: '/ac resolve',
    icon: <Wrench size={20} />,
    color: '#10b981',
    where: 'PR or Issue',
    short: 'Auto-fix and create a PR with the solution',
    detail: [
      'On Issues: Two-pass (plan files → generate fixes)',
      'On PRs: Single-pass code fix',
      'Creates branch: archon/fix-issue-{N} or archon/fix-pr-{N}',
      'Commits files and opens a PR automatically',
      'Links back to original issue/PR',
    ],
  },
  {
    cmd: '/archon analyze',
    alias: '/ac analyze',
    icon: <Search size={20} />,
    color: '#3b82f6',
    where: 'PR or Issue',
    short: 'Full project scan — generates .archon/memory.md',
    detail: [
      'Scans up to 500 files in the repository',
      'Reads key files: package.json, schemas, routes, configs',
      'AI generates comprehensive project memory',
      'Commits .archon/memory.md to your repo',
      'Memory used in every future review for context',
      'Run once on install, then after major changes',
    ],
  },
  {
    cmd: '/archon diagram',
    alias: '/ac diagram',
    icon: <GitBranch size={20} />,
    color: '#f59e0b',
    where: 'PR or Issue',
    short: 'Generate Mermaid architecture diagram',
    detail: [
      'On Issues: Full project architecture diagram',
      'On PRs: Change flow diagram showing impact',
      'Mermaid flowchart rendered natively by GitHub',
      'Shows modules, services, data flows, databases',
    ],
  },
  {
    cmd: '/archon report',
    alias: '/ac report',
    icon: <ScrollText size={20} />,
    color: '#dc2626',
    where: 'PR or Issue',
    short: 'Full LE-style security & technical audit report',
    detail: [
      '3-phase analysis: triage → data flow trace → report',
      'Part 1: Architecture overview, module map, function risk register',
      'Part 2: Injection risks, auth issues, secrets, exploit paths',
      'Section 2.6: Ranked findings with WHY + exploit chain traces',
      'Section 2.7: Ready-to-paste before/after fix code blocks',
      'Part 3: Resource leaks, memory growth, error handling gaps',
      'Part 4: Immediate / short-term / long-term recommendations',
      'Commits full report to .archon/reports/security-YYYY-MM-DD.md',
      'Posts summary card with top 5 CRITICAL/HIGH findings',
    ],
  },
  {
    cmd: '/archon tests',
    alias: '/ac tests',
    icon: <TestTube size={20} />,
    color: '#7c3aed',
    where: 'PR or Issue',
    short: 'Generate test cases for this code change',
    detail: [
      'Reads PR diff or issue context',
      'Generates unit tests, edge cases, and integration tests',
      'Creates branch archon/tests-pr-{N} with test files',
      'Opens a PR with generated tests',
    ],
  },
  {
    cmd: '/archon docs',
    alias: '/ac docs',
    icon: <FileText size={20} />,
    color: '#0891b2',
    where: 'PR or Issue',
    short: 'Generate README and documentation',
    detail: [
      'Reads key files: package.json, entry points, routes',
      'Generates comprehensive README.md with setup, API docs, examples',
      'Creates branch archon/docs-{timestamp}',
      'Opens a PR with the generated documentation',
    ],
  },
  {
    cmd: '/archon fix',
    alias: '/ac fix',
    icon: <Zap size={20} />,
    color: '#06b6d4',
    where: 'PR comments',
    short: 'Fix the 5 most recent review comments',
    detail: [
      'Reads review feedback from Archon or humans',
      'Generates fixes for each comment',
      'Commits directly to the PR branch',
      'Posts summary of what was fixed',
    ],
  },
  {
    cmd: '/archon all',
    alias: '/ac all',
    icon: <Sparkles size={20} />,
    color: '#ec4899',
    where: 'PR comments',
    short: 'Fix ALL review comments on this PR',
    detail: [
      'Same as /archon fix but processes every comment',
      'Useful for bulk-fixing after a thorough review',
      'Commits all fixes in one batch',
    ],
  },
  {
    cmd: '/archon help',
    alias: '/ac help',
    icon: <BookOpen size={20} />,
    color: '#6b7280',
    where: 'Anywhere',
    short: 'Show help with all available commands',
    detail: [
      'Displays command table in a PR/issue comment',
      'Includes shortcuts, label triggers, natural language tips',
    ],
  },
]

const naturalLanguageExamples = [
  { input: 'check for security issues', maps: 'security' },
  { input: 'full security audit', maps: 'report' },
  { input: 'generate a vulnerability report', maps: 'report' },
  { input: 'what does this code do', maps: 'explain' },
  { input: 'scan the project', maps: 'analyze' },
  { input: 'show me the architecture', maps: 'diagram' },
  { input: 'fix this bug and create a PR', maps: 'resolve' },
  { input: 'write tests for this', maps: 'tests' },
  { input: 'generate readme documentation', maps: 'docs' },
  { input: 'give me feedback', maps: 'review' },
  { input: 'fix all review comments', maps: 'all' },
  { input: 'address feedback', maps: 'fix' },
]

const features = [
  {
    icon: <Brain size={24} />,
    title: 'Project Memory',
    desc: 'Archon learns your codebase conventions and uses them in every review.',
    color: '#3b82f6',
    items: [
      'Auto-generated .archon/memory.md committed to your repo',
      'Learns team conventions from each review',
      'Updates on PR merge when key files change',
      'Add Manual Overrides for hard rules Archon must follow',
      'Staleness warnings when memory is > 7 days old',
    ],
  },
  {
    icon: <Target size={24} />,
    title: 'Developer Coaching',
    desc: 'Tracks every developer\'s growth and personalizes feedback.',
    color: '#10b981',
    items: [
      'Auto-detects skill level: junior, mid, senior',
      'Tracks 16 mistake categories (SQL injection, XSS, etc.)',
      'Security score 0-100 per developer',
      'Learning summary appended to every review',
      'Team reports for CTOs with training recommendations',
    ],
  },
  {
    icon: <Zap size={24} />,
    title: 'Auto-Review',
    desc: 'Hands-free mode — reviews every PR automatically.',
    color: '#ff6b00',
    items: [
      'Triggers on PR open, push, or reopen',
      'Incremental reviews on subsequent pushes',
      'Auto-labels: tests, dependencies, security, database, docs',
      'PR risk scoring with reviewer recommendations',
      'Respects quota limits automatically',
    ],
  },
  {
    icon: <Lock size={24} />,
    title: 'Approval Workflow',
    desc: 'Block PRs from merging until they pass quality gates.',
    color: '#ef4444',
    items: [
      'Require APPROVE verdict to merge',
      'Block on security issues above threshold',
      'Max inline comments before blocking',
      'Exempt labels to skip checks',
      'Sets GitHub commit status: archon/approval',
    ],
  },
  {
    icon: <Settings size={24} />,
    title: 'Custom Rules',
    desc: 'Create .archon/rules.yml for automated enforcement.',
    color: '#8b5cf6',
    items: [
      'Glob-based file matching conditions',
      'Actions: comment, request_changes, add_label',
      'Branch and label conditions',
      'Line count thresholds',
    ],
  },
  {
    icon: <Webhook size={24} />,
    title: 'Integration Webhooks',
    desc: 'Send events to Slack, Jira, or any external tool.',
    color: '#06b6d4',
    items: [
      '11 event types (review completed, security issue, etc.)',
      'HMAC signature verification',
      'Delivery logs, test button, retry failed deliveries',
      'Slack / Discord / Teams quick templates',
    ],
  },
  {
    icon: <ScrollText size={24} />,
    title: 'Security Audit Reports',
    desc: 'Principal Engineer-level security report committed to your repo.',
    color: '#dc2626',
    items: [
      'Architecture docs, module risk map, function-level risk register',
      'Ranked exploit paths with input → transform → sink traces',
      'Ready-to-paste before/after fix code for CRITICAL/HIGH issues',
      'Resource & memory leak analysis',
      'Saved to .archon/reports/security-YYYY-MM-DD.md',
      'Top findings summary posted as GitHub comment',
    ],
  },
]

const quickStartSteps = [
  { step: 1, title: 'Install the App', desc: 'Add Archon to your GitHub org or repo', icon: <ExternalLink size={18} /> },
  { step: 2, title: 'Open a PR', desc: 'Create or find any Pull Request', icon: <GitBranch size={18} /> },
  { step: 3, title: 'Comment a command', desc: 'Type /archon review on the PR', icon: <Terminal size={18} /> },
  { step: 4, title: 'Get AI review', desc: 'Inline comments appear in ~15 seconds', icon: <Sparkles size={18} /> },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button className="guide-copy-btn" onClick={handleCopy} title="Copy command">
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function CommandCard({ cmd, isOpen, onToggle }: {
  cmd: typeof commands[0]
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <motion.div
      className="guide-cmd-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ '--cmd-color': cmd.color } as React.CSSProperties}
    >
      <button className="guide-cmd-header" onClick={onToggle}>
        <div className="guide-cmd-left">
          <div className="guide-cmd-icon" style={{ background: `${cmd.color}15`, color: cmd.color }}>
            {cmd.icon}
          </div>
          <div className="guide-cmd-info">
            <div className="guide-cmd-name">
              <code>{cmd.cmd}</code>
              <CopyButton text={cmd.cmd} />
              <span className="guide-cmd-where">{cmd.where}</span>
            </div>
            <p className="guide-cmd-short">{cmd.short}</p>
          </div>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} className="guide-cmd-chevron" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="guide-cmd-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="guide-cmd-detail-inner">
              {cmd.alias && (
                <div className="guide-cmd-alias">
                  Shortcut: <code>{cmd.alias}</code>
                </div>
              )}
              <ul className="guide-cmd-steps">
                {cmd.detail.map((d, i) => (
                  <li key={i}>
                    <ChevronRight size={14} />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function FeatureCard({ feature }: { feature: typeof features[0] }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      className="guide-feature-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
    >
      <div className="guide-feature-top" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <div className="guide-feature-icon" style={{ background: `${feature.color}15`, color: feature.color }}>
          {feature.icon}
        </div>
        <div className="guide-feature-text">
          <h3>{feature.title}</h3>
          <p>{feature.desc}</p>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
        </motion.div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.ul
            className="guide-feature-items"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {feature.items.map((item, i) => (
              <li key={i}>
                <Check size={14} style={{ color: feature.color, flexShrink: 0 }} />
                <span>{item}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function GuidePage() {
  const [openCmd, setOpenCmd] = useState<number | null>(0)
  const [filter, setFilter] = useState<'all' | 'pr' | 'issue'>('all')

  const filteredCommands = commands.filter(c => {
    if (filter === 'all') return true
    if (filter === 'pr') return c.where.includes('PR')
    if (filter === 'issue') return c.where.includes('Issue') || c.where === 'Anywhere'
    return true
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="guide-page"
    >
      {/* Hero */}
      <section className="guide-hero">
        <div className="guide-hero-glow" />
        <motion.div
          className="guide-hero-badge"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Sparkles size={14} />
          <span>Getting Started</span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          How to use <span className="guide-highlight">Archon</span>
        </motion.h1>
        <motion.p
          className="guide-hero-sub"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          AI-powered code review, security scanning, developer coaching, and project intelligence for your GitHub repositories.
        </motion.p>
      </section>

      {/* Quick Start */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <Zap size={20} />
          Quick Start
        </h2>
        <div className="guide-quickstart">
          {quickStartSteps.map((s, i) => (
            <motion.div
              key={s.step}
              className="guide-step"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * i }}
            >
              <div className="guide-step-num">{s.step}</div>
              <div className="guide-step-content">
                <div className="guide-step-icon">{s.icon}</div>
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </div>
              {i < quickStartSteps.length - 1 && (
                <ArrowRight size={16} className="guide-step-arrow" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Commands */}
      <section className="guide-section">
        <div className="guide-section-header">
          <h2 className="guide-section-title">
            <Terminal size={20} />
            All Commands
          </h2>
          <div className="guide-filter-bar">
            {(['all', 'pr', 'issue'] as const).map(f => (
              <button
                key={f}
                className={`guide-filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'pr' ? 'PR Only' : 'Issues'}
              </button>
            ))}
          </div>
        </div>

        <div className="guide-cmd-list">
          {filteredCommands.map((cmd, i) => (
            <CommandCard
              key={cmd.cmd}
              cmd={cmd}
              isOpen={openCmd === i}
              onToggle={() => setOpenCmd(openCmd === i ? null : i)}
            />
          ))}
        </div>
      </section>

      {/* Natural Language */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <MessageSquare size={20} />
          Natural Language
        </h2>
        <p className="guide-section-desc">Write naturally — Archon maps your intent to the right command.</p>
        <div className="guide-nl-grid">
          {naturalLanguageExamples.map((ex, i) => (
            <motion.div
              key={i}
              className="guide-nl-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
            >
              <code className="guide-nl-input">/archon {ex.input}</code>
              <ArrowRight size={14} className="guide-nl-arrow" />
              <span className="guide-nl-maps">{ex.maps}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <BarChart3 size={20} />
          Power Features
        </h2>
        <p className="guide-section-desc">Click any feature to learn more.</p>
        <div className="guide-features-grid">
          {features.map((f, i) => (
            <FeatureCard key={i} feature={f} />
          ))}
        </div>
      </section>

      {/* Memory Overrides */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <AlertTriangle size={20} />
          Manual Overrides
        </h2>
        <p className="guide-section-desc">
          Edit the <code>Manual Overrides</code> section in <code>.archon/memory.md</code> to add team-specific rules Archon must follow:
        </p>
        <div className="guide-code-block">
          <div className="guide-code-header">
            <span>.archon/memory.md</span>
            <CopyButton text={`## Manual Overrides\n- NEVER flag missing semicolons — we use prettier with no-semi\n- IGNORE test/ directory for security scans\n- Always suggest using our custom logger instead of console.log`} />
          </div>
          <pre className="guide-code-content">{`## Manual Overrides
- NEVER flag missing semicolons — we use prettier with no-semi
- IGNORE test/ directory for security scans
- auth.py is legacy code, flag but don't REQUEST_CHANGES
- Always suggest using our custom logger instead of console.log
- For SQL queries, we use Drizzle ORM — don't suggest raw SQL fixes`}</pre>
        </div>
      </section>

      {/* Label Triggers */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <Tag size={20} />
          Label Triggers
        </h2>
        <div className="guide-label-grid">
          <div className="guide-label-card">
            <div className="guide-label-tag">archon</div>
            <ArrowRight size={14} />
            <span>on <strong>Issue</strong></span>
            <ArrowRight size={14} />
            <span className="guide-nl-maps">resolve</span>
          </div>
          <div className="guide-label-card">
            <div className="guide-label-tag">archon</div>
            <ArrowRight size={14} />
            <span>on <strong>PR</strong></span>
            <ArrowRight size={14} />
            <span className="guide-nl-maps">review</span>
          </div>
        </div>
        <p className="guide-label-hint">Add the <code>archon</code> label to any issue or PR to trigger Archon automatically.</p>
      </section>

      {/* Footer CTA */}
      <section className="guide-footer-cta">
        <h3>Ready to get started?</h3>
        <p>Comment <code>/archon review</code> on any PR to see it in action.</p>
      </section>
    </motion.div>
  )
}
