import React from 'react';
import { ShieldX, ArrowLeft, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

const AccessRestricted: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-bg-base">
    <div className="text-center animate-fade-in max-w-md">
      {/* Icon */}
      <div className="mx-auto w-20 h-20 rounded-2xl bg-sev-critical/10 border border-sev-critical/20 flex items-center justify-center mb-6">
        <ShieldX className="h-10 w-10 text-sev-critical" />
      </div>

      <div className="glass-card-premium rounded-2xl p-8">
        <h1 className="text-xl font-bold text-text-primary mb-2">Access Restricted</h1>
        <p className="text-sm text-text-secondary mb-6 leading-relaxed">
          You don't have permission to access this resource. Contact your administrator to request access.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/login"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary border border-border-subtle hover:border-brand/30 hover:text-text-primary transition-all"
          >
            <ArrowLeft size={14} />
            Sign In
          </Link>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-brand hover:bg-brand-light transition-all shadow-[0_0_15px_rgba(99,44,175,0.15)]">
            <Mail size={14} />
            Contact Admin
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default AccessRestricted;
