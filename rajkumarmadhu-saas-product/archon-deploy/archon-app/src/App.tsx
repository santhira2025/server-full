import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  CreditCard,
  History,
  LogOut,
  ChevronRight,
  GitBranch,
  FileSearch,
  GraduationCap,
  Users,
  Webhook,
  Wifi,
  WifiOff,
  Menu,
  X,
  ListTodo,
  BookOpen
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getStats } from './lib/api'
import { useRealtime } from './hooks/useRealtime'
import { useToast } from './hooks/useToast'
import { OrgProvider } from './context/OrgContext'
import ToastContainer from './components/ToastContainer'
import OrgSelector from './components/OrgSelector'
import DashboardPage from './pages/DashboardPage'
import EventLogsPage from './pages/EventLogsPage'
import RepoSettingsPage from './pages/RepoSettingsPage'
import ReviewHistoryPage from './pages/ReviewHistoryPage'
import CoachingPage from './pages/CoachingPage'
import TeamPage from './pages/TeamPage'
import WebhooksPage from './pages/WebhooksPage'
import BillingPage from './pages/BillingPage'
import TasksPage from './pages/TasksPage'
import GuidePage from './pages/GuidePage'
import LoginPage from './pages/LoginPage'
import './App.css'

function App() {
  const [token, setToken] = useState(localStorage.getItem('archon_token'))
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { toasts, addToast, removeToast } = useToast()

  // Derive active tab from current route
  const getActiveTab = () => {
    const path = location.pathname
    if (path.startsWith('/billing')) return 'billing'
    if (path.startsWith('/events')) return 'events'
    if (path.startsWith('/repos')) return 'repos'
    if (path.startsWith('/reviews')) return 'reviews'
    if (path.startsWith('/coaching')) return 'coaching'
    if (path.startsWith('/team')) return 'team'
    if (path.startsWith('/webhooks')) return 'webhooks'
    if (path.startsWith('/tasks')) return 'tasks'
    if (path.startsWith('/guide')) return 'guide'
    return 'dashboard'
  }
  const activeTab = getActiveTab()

  // Real-time SSE connection
  const handleNewEvent = useCallback((event: any) => {
    if (event.items?.length > 0) {
      const latest = event.items[0]
      addToast({
        type: 'info',
        title: 'New Event',
        message: `${latest.eventType?.replace(/_/g, ' ')} on ${latest.repo || 'system'}`,
      })
    }
  }, [addToast])

  const handleNewReview = useCallback((event: any) => {
    if (event.items?.length > 0) {
      const latest = event.items[0]
      addToast({
        type: 'success',
        title: 'Review Completed',
        message: `${latest.repo} #${latest.issueNumber} — ${latest.verdict || 'COMMENT'}`,
      })
    }
  }, [addToast])

  const { connected } = useRealtime({
    onEvent: handleNewEvent,
    onReview: handleNewReview,
    enabled: !!token,
  })

  // Handle OAuth Callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlToken = urlParams.get('token')
    if (urlToken) {
      localStorage.setItem('archon_token', urlToken)
      setToken(urlToken)
      window.history.replaceState({}, document.title, "/")
    }
  }, [])

  // Fetch Data
  useEffect(() => {
    if (token) {
      setIsLoading(true)
      getStats()
        .then(res => {
          setData(res)
          setIsLoading(false)
        })
        .catch(err => {
          console.error("Failed to fetch stats", err)
          if (err.response?.status === 401) {
            handleLogout()
          }
          setIsLoading(false)
        })
    }
  }, [token])

  const handleLogout = () => {
    localStorage.removeItem('archon_token')
    setToken(null)
    setData(null)
  }

  const handleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/auth/github`
  }

  if (!token) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <OrgProvider token={token}>
    <div className="app-container">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
          <X size={20} />
        </button>
        <div className="logo-section">
          <div className="logo-icon">A</div>
          <span className="logo-text">Archon</span>
        </div>

        <OrgSelector />

        <nav className="nav-menu">
          <NavItem
            icon={<LayoutDashboard size={20} />}
            label="Overview"
            active={activeTab === 'dashboard'}
            onClick={() => { navigate('/'); setSidebarOpen(false) }}
          />
          <NavItem
            icon={<BookOpen size={20} />}
            label="Guide"
            active={activeTab === 'guide'}
            onClick={() => { navigate('/guide'); setSidebarOpen(false) }}
          />
          <NavItem
            icon={<GitBranch size={20} />}
            label="Repositories"
            active={activeTab === 'repos'}
            onClick={() => { navigate('/repos'); setSidebarOpen(false) }}
          />
          <NavItem
            icon={<FileSearch size={20} />}
            label="Reviews"
            active={activeTab === 'reviews'}
            onClick={() => { navigate('/reviews'); setSidebarOpen(false) }}
          />
          <NavItem
            icon={<GraduationCap size={20} />}
            label="Coach"
            active={activeTab === 'coaching'}
            onClick={() => { navigate('/coaching'); setSidebarOpen(false) }}
          />
          <NavItem
            icon={<Users size={20} />}
            label="Team"
            active={activeTab === 'team'}
            onClick={() => { navigate('/team'); setSidebarOpen(false) }}
          />
          <NavItem
            icon={<Webhook size={20} />}
            label="Webhooks"
            active={activeTab === 'webhooks'}
            onClick={() => { navigate('/webhooks'); setSidebarOpen(false) }}
          />
          <NavItem
            icon={<ListTodo size={20} />}
            label="Tasks"
            active={activeTab === 'tasks'}
            onClick={() => { navigate('/tasks'); setSidebarOpen(false) }}
          />
          <NavItem
            icon={<History size={20} />}
            label="Event Logs"
            active={activeTab === 'events'}
            onClick={() => { navigate('/events'); setSidebarOpen(false) }}
          />
          <NavItem
            icon={<CreditCard size={20} />}
            label="Billing"
            active={activeTab === 'billing'}
            onClick={() => { navigate('/billing'); setSidebarOpen(false) }}
          />
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <img src={`https://github.com/${data?.org?.githubLogin || 'ghost'}.png`} alt="User" />
            <div className="user-info">
              <p className="username">{data?.org?.githubLogin || 'Loading...'}</p>
              <p className="plan-badge">{data?.org?.plan?.toUpperCase() || 'FREE'} PLAN</p>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="top-header">
          <div className="header-left">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
              <Menu size={22} />
            </button>
            <div className="breadcrumb">
              <span>Home</span>
              <ChevronRight size={14} />
              <span className="current">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span>
            </div>
          </div>

          <div className="header-actions">
            <div className={`connection-status ${connected ? 'online' : 'offline'}`}>
              {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{connected ? 'Live' : 'Offline'}</span>
            </div>
            {isLoading && <span className="loading-indicator">Syncing...</span>}
            <a href="https://github.com/apps/archon-org" target="_blank" rel="noopener noreferrer">
              <button className="glow-btn">Install App</button>
            </a>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<DashboardPage connected={connected} />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/repos" element={<RepoSettingsPage />} />
            <Route path="/reviews" element={<ReviewHistoryPage />} />
            <Route path="/coaching" element={<CoachingPage />} />
            <Route path="/team" element={<TeamPage addToast={addToast} />} />
            <Route path="/webhooks" element={<WebhooksPage addToast={addToast} />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/events" element={<EventLogsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
          </Routes>
        </AnimatePresence>

        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </main>
    </div>
    </OrgProvider>
  )
}

// ── Auth Callback ────────────────────────────────────────────────

function AuthCallback() {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    if (token) {
      localStorage.setItem('archon_token', token)
      window.location.href = '/'
    }
  }, [])
  return <p>Authenticating...</p>
}

// ── Shared Components ────────────────────────────────────────────

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {active && <motion.div layoutId="nav-active" className="nav-indicator" />}
    </button>
  )
}

export default App
