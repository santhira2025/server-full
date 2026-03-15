import React from 'react';
import { FileSearch, ArrowRight, Code, FileJson, Diff } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

const TestInspector: React.FC = () => (
  <div className="space-y-5 animate-fade-in">
    <GlassCard variant="elevated" className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
          <FileSearch size={18} className="text-brand" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary">Test Inspector</h2>
          <p className="text-[11px] text-text-muted">Detailed request/response analysis for vulnerability findings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {[
          { icon: Code, label: 'Request/Response', desc: 'View original and mutated HTTP requests with syntax highlighting', color: '#3B82F6' },
          { icon: Diff, label: 'Diff View', desc: 'Compare original vs mutated request payloads side by side', color: '#632CA6' },
          { icon: FileJson, label: 'Proof of Concept', desc: 'Vulnerability proof with annotated response highlighting', color: '#EF4444' },
        ].map(({ icon: Icon, label, desc, color }) => (
          <div key={label} className="metric-card p-4 flex flex-col gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}12` }}>
              <Icon size={16} style={{ color }} />
            </div>
            <h3 className="text-xs font-medium text-text-primary">{label}</h3>
            <p className="text-[10px] text-text-muted leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="text-center py-6 bg-bg-base rounded-lg border border-border-subtle">
        <FileSearch size={28} className="mx-auto mb-2 text-text-muted" />
        <p className="text-xs text-text-muted">
          Select a vulnerability from the <span className="text-brand font-medium">Vulnerabilities</span> tab to inspect details
        </p>
        <button className="mt-3 text-[11px] text-brand hover:underline flex items-center gap-1 mx-auto">
          Go to Vulnerabilities <ArrowRight size={11} />
        </button>
      </div>
    </GlassCard>
  </div>
);

export default TestInspector;
