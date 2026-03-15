import React, { useState } from 'react';
import { ArrowLeft, Globe, Terminal, Upload, Wifi, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { post } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import GlassCard from '@/components/ui/GlassCard';

type TrafficSource = 'burp' | 'aws' | 'nginx' | 'envoy' | 'manual' | null;

const TRAFFIC_SOURCES: Array<{ id: TrafficSource; label: string; icon: React.FC<{ size?: number }>; desc: string; color: string }> = [
  { id: 'burp', label: 'Burp Suite', icon: Terminal, desc: 'Send traffic via Burp Suite proxy extension', color: '#632CA6' },
  { id: 'aws', label: 'AWS Traffic Mirroring', icon: Wifi, desc: 'Mirror VPC traffic to collector', color: '#3B82F6' },
  { id: 'nginx', label: 'NGINX / Kong', icon: Globe, desc: 'Use API gateway plugin to forward traffic', color: '#22C55E' },
  { id: 'envoy', label: 'Envoy Proxy', icon: Globe, desc: 'Configure Envoy sidecar to send traffic', color: '#7C3AED' },
  { id: 'manual', label: 'Manual Upload', icon: Upload, desc: 'Upload HAR, Postman, or Swagger files', color: '#EAB308' },
];

const AddApplication: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [appName, setAppName] = useState('');
  const [selectedSource, setSelectedSource] = useState<TrafficSource>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [collectionId, setCollectionId] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!appName.trim()) return;
    setCreating(true);
    try {
      const res = await post<{ id?: number }>('/api/createCollection', { collectionName: appName.trim() });
      setCollectionId(res?.id ?? null);
      setCreated(true);
      qc.invalidateQueries({ queryKey: ['discovery', 'collections'] });
      setStep(2);
    } catch { /* error handled */ }
    setCreating(false);
  };

  const aktoToken = `AKTO_TOKEN=<your-api-key>`;
  const collectorUrl = `AKTO_COLLECTOR_URL=http://<your-server>:9090`;

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl mx-auto pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/organization')} className="w-8 h-8 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-text-muted hover:text-text-primary hover:border-brand/20 transition-all">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-bold text-text-primary">Add Application</h2>
          <p className="text-[11px] text-text-muted">Register a new application and connect API traffic</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s ? 'bg-brand text-white shadow-[0_0_8px_rgba(99,44,175,0.3)]' : 'bg-bg-elevated text-text-muted border border-border-subtle'}`}>
              {step > s ? <CheckCircle2 size={14} /> : s}
            </div>
            <span className={`text-[11px] font-medium ${step >= s ? 'text-text-primary' : 'text-text-muted'}`}>
              {s === 1 ? 'Name' : s === 2 ? 'Traffic Source' : 'Connect'}
            </span>
            {s < 3 && <div className={`w-12 h-px transition-all ${step > s ? 'bg-brand' : 'bg-border-subtle'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Name */}
      {step === 1 && (
        <GlassCard variant="elevated" className="p-6 space-y-5">
          <div>
            <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Application Name</label>
            <input type="text" value={appName} onChange={e => setAppName(e.target.value)} placeholder="e.g., customer-api-prod"
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/20 transition-all" />
          </div>
          <button onClick={handleCreate} disabled={!appName.trim() || creating}
            className="px-5 py-2.5 rounded-lg bg-brand text-sm font-bold text-white hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2">
            {creating && <Loader2 size={14} className="animate-spin" />}
            Create Application
          </button>
        </GlassCard>
      )}

      {/* Step 2: Traffic Source */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-[11px] text-text-muted">Choose how to send API traffic to the platform:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TRAFFIC_SOURCES.map(src => (
              <GlassCard key={src.id} variant="default" className={`p-4 cursor-pointer ${selectedSource === src.id ? 'border-brand/40' : ''}`}
                hoverLift onClick={() => { setSelectedSource(src.id); setStep(3); }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${src.color}12` }}>
                    <src.icon size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{src.label}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">{src.desc}</div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Connection Instructions */}
      {step === 3 && (
        <GlassCard variant="elevated" className="p-6 space-y-5">
          {created && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sev-low/10 border border-sev-low/20 text-xs text-sev-low">
              <CheckCircle2 size={14} />
              Application "{appName}" created successfully{collectionId ? ` (ID: ${collectionId})` : ''}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Connect via {TRAFFIC_SOURCES.find(s => s.id === selectedSource)?.label}
            </h3>
            <p className="text-[11px] text-text-muted mb-4">Configure your traffic source with the following environment variables:</p>
            <div className="space-y-2">
              {[aktoToken, collectorUrl].map(line => (
                <div key={line} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-bg-base border border-border-subtle">
                  <code className="text-[11px] text-text-primary flex-1 font-mono">{line}</code>
                  <button onClick={() => navigator.clipboard.writeText(line)}
                    className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-brand transition-colors">
                    <Copy size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-text-muted space-y-1">
            <p>Once traffic starts flowing, endpoints will appear automatically in the Discovery section.</p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => navigate('/discovery')} className="px-5 py-2.5 rounded-lg bg-brand text-sm font-bold text-white hover:bg-brand-dark transition-colors">Go to Discovery</button>
            <button onClick={() => navigate('/organization')} className="px-5 py-2.5 rounded-lg border border-border-subtle text-sm text-text-muted hover:text-text-primary hover:border-brand/20 transition-all">Back to Organization</button>
          </div>
        </GlassCard>
      )}
    </div>
  );
};

export default AddApplication;
