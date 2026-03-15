import React, { useState } from 'react';
import { GitBranch, ArrowRight, Server, Globe, Database, Zap } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

interface FlowNode {
  id: string;
  label: string;
  type: 'client' | 'gateway' | 'service' | 'database';
  x: number;
  y: number;
}

interface FlowEdge {
  from: string;
  to: string;
  label: string;
  method: string;
}

const demoNodes: FlowNode[] = [
  { id: 'client', label: 'Client', type: 'client', x: 50, y: 120 },
  { id: 'gateway', label: 'API Gateway', type: 'gateway', x: 220, y: 120 },
  { id: 'auth', label: 'Auth Service', type: 'service', x: 390, y: 50 },
  { id: 'api', label: 'API Service', type: 'service', x: 390, y: 190 },
  { id: 'db', label: 'Database', type: 'database', x: 560, y: 120 },
];

const demoEdges: FlowEdge[] = [
  { from: 'client', to: 'gateway', label: '/api/*', method: 'ALL' },
  { from: 'gateway', to: 'auth', label: '/auth/verify', method: 'POST' },
  { from: 'gateway', to: 'api', label: '/api/v1/*', method: 'GET' },
  { from: 'api', to: 'db', label: 'query', method: 'SQL' },
];

const nodeIcons = {
  client: Globe,
  gateway: Zap,
  service: Server,
  database: Database,
};

const nodeColors = {
  client: '#3B82F6',
  gateway: '#632CA6',
  service: '#22C55E',
  database: '#8B5CF6',
};

const ApiSequenceFlow: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  return (
    <div className="space-y-5 animate-fade-in">
      <GlassCard variant="elevated" className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
              <GitBranch size={18} className="text-brand" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">API Sequence Flow</h2>
              <p className="text-[11px] text-text-muted">Visual flow diagram showing API call sequences and request chains</p>
            </div>
          </div>
        </div>

        {/* Flow Visualization */}
        <div className="relative bg-bg-base rounded-xl border border-border-subtle p-6 min-h-[300px] overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-30" />

          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            {demoEdges.map((edge, i) => {
              const fromNode = demoNodes.find(n => n.id === edge.from);
              const toNode = demoNodes.find(n => n.id === edge.to);
              if (!fromNode || !toNode) return null;
              const x1 = fromNode.x + 60;
              const y1 = fromNode.y + 20;
              const x2 = toNode.x;
              const y2 = toNode.y + 20;
              const midX = (x1 + x2) / 2;
              return (
                <g key={i}>
                  <path
                    d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="rgba(99,44,175,0.3)"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    className="animate-[draw-line_2s_ease-out]"
                  />
                  <text x={midX} y={Math.min(y1, y2) - 8} textAnchor="middle" fill="#6B6B80" fontSize={9} fontFamily="Plus Jakarta Sans">
                    {edge.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          <div className="relative" style={{ zIndex: 2 }}>
            {demoNodes.map((node) => {
              const Icon = nodeIcons[node.type];
              const color = nodeColors[node.type];
              const isSelected = selectedNode === node.id;
              return (
                <div
                  key={node.id}
                  className={`absolute cursor-pointer transition-all duration-200 ${isSelected ? 'scale-110' : 'hover:scale-105'}`}
                  style={{ left: node.x, top: node.y }}
                  onClick={() => setSelectedNode(isSelected ? null : node.id)}
                >
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur-sm ${
                      isSelected ? 'border-brand/50 shadow-[0_0_20px_rgba(99,44,175,0.15)]' : 'border-border-subtle'
                    }`}
                    style={{ background: `${color}08` }}
                  >
                    <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${color}15` }}>
                      <Icon size={14} style={{ color }} />
                    </div>
                    <span className="text-xs font-medium text-text-primary">{node.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected node details */}
        {selectedNode && (
          <div className="mt-4 p-4 bg-bg-base rounded-lg border border-border-subtle animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-text-primary">
                {demoNodes.find(n => n.id === selectedNode)?.label}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                {demoNodes.find(n => n.id === selectedNode)?.type}
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
              Connected edges: {demoEdges.filter(e => e.from === selectedNode || e.to === selectedNode).length} |
              Click another node to see its connections.
            </p>
          </div>
        )}

        <p className="text-[11px] text-text-muted mt-4 text-center">
          Flow diagram will populate automatically once API traffic is analyzed and call chains are detected.
        </p>
      </GlassCard>
    </div>
  );
};

export default ApiSequenceFlow;
