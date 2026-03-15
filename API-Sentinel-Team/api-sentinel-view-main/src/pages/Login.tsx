import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const Login: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [shakeError, setShakeError] = React.useState(false);
  const [isSignup, setIsSignup] = React.useState(false);
  const { user, login, signup, error: authError } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/organization';

  if (user) return <Navigate to={from} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLocalError('Please enter email and password');
      triggerShake();
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      triggerShake();
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        await signup(email, password);
      } else {
        await login(email, password);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Something went wrong. Please try again.';
      setLocalError(msg);
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  };

  const triggerShake = () => {
    setShakeError(true);
    setTimeout(() => setShakeError(false), 500);
  };

  const displayError = localError || authError;

  return (
    <div className="relative flex min-h-screen font-sans overflow-hidden" style={{ background: '#fafbff' }}>
      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute rounded-full blur-[100px] opacity-30"
          style={{
            width: 600, height: 600,
            top: '-10%', left: '-5%',
            background: 'radial-gradient(circle, #818cf8 0%, #6366f1 50%, transparent 70%)',
            animation: 'mesh-float-1 20s ease-in-out infinite',
          }}
        />
        <div
          className="absolute rounded-full blur-[120px] opacity-20"
          style={{
            width: 500, height: 500,
            top: '40%', right: '-10%',
            background: 'radial-gradient(circle, #f472b6 0%, #ec4899 50%, transparent 70%)',
            animation: 'mesh-float-2 25s ease-in-out infinite',
          }}
        />
        <div
          className="absolute rounded-full blur-[90px] opacity-20"
          style={{
            width: 400, height: 400,
            bottom: '-5%', left: '30%',
            background: 'radial-gradient(circle, #fbbf24 0%, #f59e0b 50%, transparent 70%)',
            animation: 'mesh-float-3 18s ease-in-out infinite',
          }}
        />
        <div
          className="absolute rounded-full blur-[80px] opacity-15"
          style={{
            width: 350, height: 350,
            top: '20%', left: '50%',
            background: 'radial-gradient(circle, #34d399 0%, #10b981 50%, transparent 70%)',
            animation: 'mesh-float-4 22s ease-in-out infinite',
          }}
        />
      </div>

      {/* Left Panel - Brand Showcase */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center relative z-10 px-12">
        <div className="max-w-lg text-center">
          {/* Logo */}
          <div className="mx-auto mb-8 w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
            }}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L21 6.5V13C21 17.4 17 21.2 12 22C7 21.2 3 17.4 3 13V6.5L12 2Z" fill="rgba(255,255,255,0.9)" />
              <path d="M12 6L17 8.5V13C17 15.5 14.8 17.7 12 18.5C9.2 17.7 7 15.5 7 13V8.5L12 6Z" fill="#7c3aed" />
            </svg>
          </div>

          {/* Gradient title */}
          <h1
            className="text-5xl font-extrabold mb-4 leading-tight"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 50%, #f59e0b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            API Sentinel
          </h1>
          <p className="text-lg mb-8" style={{ color: '#64748b' }}>
            Enterprise-grade API security platform.
            <br />
            Discover, test, protect, and monitor your APIs in real-time.
          </p>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '🔍', title: 'API Discovery', desc: 'Auto-discover all endpoints' },
              { icon: '🧪', title: 'Security Testing', desc: 'OWASP Top 10 coverage' },
              { icon: '🛡️', title: 'Real-time Protection', desc: 'WAF & threat blocking' },
              { icon: '📊', title: 'Compliance Reports', desc: 'PCI-DSS, HIPAA, SOC2' },
            ].map((feat) => (
              <div
                key={feat.title}
                className="rounded-xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(228, 231, 238, 0.8)',
                  boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)',
                }}
              >
                <div className="text-xl mb-1.5">{feat.icon}</div>
                <div className="text-sm font-semibold" style={{ color: '#0f172a' }}>{feat.title}</div>
                <div className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{feat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <form
          onSubmit={handleSubmit}
          className={`w-full max-w-[440px] space-y-6 rounded-2xl p-8 md:p-10 ${shakeError ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
          style={{
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid #e4e7ee',
            boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08), 0 1px 4px rgba(15, 23, 42, 0.04)',
            animationName: shakeError ? 'shake' : 'none',
          }}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-3">
            {/* Mobile logo */}
            <div
              className="lg:hidden w-14 h-14 rounded-xl flex items-center justify-center mb-1"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L21 6.5V13C21 17.4 17 21.2 12 22C7 21.2 3 17.4 3 13V6.5L12 2Z" fill="rgba(255,255,255,0.9)" />
                <path d="M12 6L17 8.5V13C17 15.5 14.8 17.7 12 18.5C9.2 17.7 7 15.5 7 13V8.5L12 6Z" fill="#7c3aed" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: '#0f172a' }}>
              {isSignup ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="text-sm" style={{ color: '#64748b' }}>
              {isSignup ? 'Set up your admin account' : 'Sign in to your security dashboard'}
            </p>
          </div>

          {/* Error */}
          {displayError && (
            <div
              className="rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 animate-fade-in"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#dc2626',
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              {displayError}
            </div>
          )}

          <div className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                Email
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl pl-10 pr-4 py-3 text-sm transition-all outline-none"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    color: '#0f172a',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#818cf8';
                    e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e2e8f0';
                    e.target.style.boxShadow = 'none';
                  }}
                  placeholder="you@company.com"
                  disabled={submitting}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  Password
                </label>
                {!isSignup && (
                  <a href="#" className="text-[11px] font-medium hover:underline" style={{ color: '#6366f1' }}>
                    Forgot?
                  </a>
                )}
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl pl-10 pr-10 py-3 text-sm transition-all outline-none"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    color: '#0f172a',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#818cf8';
                    e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e2e8f0';
                    e.target.style.boxShadow = 'none';
                  }}
                  placeholder={isSignup ? 'Min 6 characters' : '••••••••'}
                  disabled={submitting}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#94a3b8' }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            {!isSignup && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                  style={{ accentColor: '#6366f1' }}
                />
                <span className="text-xs" style={{ color: '#64748b' }}>Remember me</span>
              </label>
            )}

            {/* Submit Button - Archon gradient style */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl px-4 py-3.5 text-sm font-bold text-white flex justify-center items-center gap-2 mt-2 transition-all duration-200 disabled:opacity-60 hover:opacity-90 hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #7c3aed, #a855f7)',
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)',
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting
                ? (isSignup ? 'Creating Account...' : 'Signing In...')
                : (isSignup ? 'Create Account' : 'Sign In')}
            </button>
          </div>

          {/* Toggle mode */}
          <div className="text-center pt-4" style={{ borderTop: '1px solid #e4e7ee' }}>
            <button
              type="button"
              onClick={() => { setIsSignup(v => !v); setLocalError(null); }}
              className="text-xs transition-colors outline-none cursor-pointer"
              style={{ color: '#64748b' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#6366f1')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              {isSignup ? 'Already have an account? ' : 'First time? '}
              <span style={{ color: '#6366f1', fontWeight: 600 }}>
                {isSignup ? 'Sign In' : 'Create Admin Account'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-4px); }
          30%, 70% { transform: translateX(4px); }
        }
        @keyframes mesh-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(60px, -40px) scale(1.1); }
          66% { transform: translate(-30px, 30px) scale(0.95); }
        }
        @keyframes mesh-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-50px, 30px) scale(1.05); }
          66% { transform: translate(40px, -20px) scale(0.9); }
        }
        @keyframes mesh-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.08); }
          66% { transform: translate(-40px, 20px) scale(0.92); }
        }
        @keyframes mesh-float-4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-40px, -30px) scale(1.05); }
          66% { transform: translate(50px, 40px) scale(0.95); }
        }
      `}</style>
    </div>
  );
};

export default Login;
