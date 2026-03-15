import React, { useState } from 'react';
import { RefreshCw, Download, FileText, ChevronDown, CheckCircle, AlertTriangle, Shield } from 'lucide-react';
import { useComplianceReport, useGenerateExport } from '@/hooks/use-compliance';
import TableSkeleton from '@/components/shared/TableSkeleton';
import GlassCard from '@/components/ui/GlassCard';
import MetricWidget from '@/components/ui/MetricWidget';
import ProgressRing from '@/components/ui/ProgressRing';

const Reports: React.FC = () => {
  const [selectedFramework, setSelectedFramework] = useState('OWASP_API_2023');
  const [isExporting, setIsExporting] = useState(false);

  const { data: report, isLoading, isError, refetch } = useComplianceReport(selectedFramework);
  const exporter = useGenerateExport();

  const frameworks = [
    { id: 'OWASP_API_2023', name: 'OWASP API Top 10 (2023)' },
    { id: 'GDPR', name: 'GDPR Compliance' },
    { id: 'HIPAA', name: 'HIPAA Security Rule' },
  ];

  const totalFindings = report?.total_open ?? 0;
  const failedControls = report ? Object.keys(report.sections).length : 0;
  const posture = totalFindings === 0 ? 'Optimal' : totalFindings < 5 ? 'Good' : totalFindings < 10 ? 'At Risk' : 'Critical';
  const postureScore = totalFindings === 0 ? 100 : totalFindings < 5 ? 75 : totalFindings < 10 ? 40 : 15;

  const handlePdfExport = () => {
    const frameworkName = frameworks.find(f => f.id === selectedFramework)?.name ?? selectedFramework;
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const sections = report?.sections ?? {};
    const postureColor = totalFindings === 0 ? '#22C55E' : totalFindings < 5 ? '#EAB308' : '#EF4444';

    const rows = Object.entries(sections).flatMap(([section, vulns]: [string, any]) =>
      vulns.map((v: any) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2530;font-size:12px;color:#e8edf3">${section}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2530;font-size:12px;color:#e8edf3">${v.title ?? v.type ?? '-'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2530;font-size:12px;font-family:monospace;color:#94a3b8">${v.endpoint ?? v.url ?? '-'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2530;font-size:12px;color:${v.severity === 'CRITICAL' || v.severity === 'HIGH' ? '#ef4444' : v.severity === 'MEDIUM' ? '#eab308' : '#22c55e'}">${v.severity ?? '-'}</td>
        </tr>`).join('')
    );

    const html = `<!DOCTYPE html><html><head><title>Security Compliance Report</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#0d1117;padding:40px}
      .header{border-bottom:3px solid #f97316;padding-bottom:24px;margin-bottom:32px}
      .logo{font-size:24px;font-weight:900;color:#f97316;letter-spacing:-0.5px}
      .subtitle{font-size:13px;color:#6b7280;margin-top:4px}
      .exec-box{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-bottom:32px}
      .exec-title{font-size:16px;font-weight:700;color:#0d1117;margin-bottom:12px}
      .exec-text{font-size:13px;color:#374151;line-height:1.6}
      .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px}
      .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:20px;text-align:center}
      .kpi-val{font-size:36px;font-weight:900;margin-bottom:4px}
      .kpi-label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      thead tr{background:#f97316}
      thead th{padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
      .footer{margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between}
      @media print{body{padding:20px}.kpis{page-break-inside:avoid}}
    </style></head><body>
    <div class="header">
      <div class="logo">API SENTINEL</div>
      <div class="subtitle">Security Compliance Report &mdash; ${frameworkName}</div>
      <div style="margin-top:8px;font-size:12px;color:#6b7280">Generated: ${date} &nbsp;&bull;&nbsp; Classification: CONFIDENTIAL</div>
    </div>
    <div class="exec-box">
      <div class="exec-title">Executive Summary</div>
      <div class="exec-text">
        This report presents the current API security posture against the <strong>${frameworkName}</strong> framework.
        The platform has identified <strong>${totalFindings} open finding${totalFindings !== 1 ? 's' : ''}</strong> across <strong>${Object.keys(sections).length} control categories</strong>.
        Overall compliance posture is assessed as <strong style="color:${postureColor}">${posture}</strong>.
        ${totalFindings === 0 ? 'All monitored APIs are currently compliant with the selected framework.' : 'Immediate attention is recommended for CRITICAL and HIGH severity findings listed below.'}
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-val" style="color:#ef4444">${totalFindings}</div><div class="kpi-label">Total Findings</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#f97316">${Object.keys(sections).length}</div><div class="kpi-label">Failed Controls</div></div>
      <div class="kpi"><div class="kpi-val" style="color:${postureColor}">${posture}</div><div class="kpi-label">Compliance Posture</div></div>
    </div>
    ${totalFindings > 0 ? `
    <table>
      <thead><tr><th>Category</th><th>Finding</th><th>Endpoint</th><th>Severity</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div style="text-align:center;padding:40px;color:#22c55e;font-size:16px;font-weight:700">&#x2713; No compliance violations found</div>'}
    <div class="footer">
      <span>API Sentinel &copy; ${new Date().getFullYear()} &mdash; Confidential Security Report</span>
      <span>Framework: ${frameworkName} &mdash; ${date}</span>
    </div>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => { win.print(); }, 500); }
  };

  const handleExport = async (format: string) => {
    setIsExporting(true);
    try {
      const content = await exporter.mutateAsync({ framework: selectedFramework, format });
      if (format === 'html' && typeof content === 'string') {
        const win = window.open('', '_blank');
        win?.document.write(content);
        win?.document.close();
      }
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
            <FileText size={18} className="text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Compliance Reporting</h2>
            <p className="text-[11px] text-text-muted">Mapping vulnerabilities to industry regulatory frameworks</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-bg-surface border border-border-subtle rounded-lg text-xs text-text-primary hover:border-brand/20 transition-all">
              {frameworks.find(f => f.id === selectedFramework)?.name}
              <ChevronDown size={12} />
            </button>
            <div className="absolute top-full right-0 mt-1 w-64 glass-card-premium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
              {frameworks.map(f => (
                <button key={f.id} onClick={() => setSelectedFramework(f.id)}
                  className={`w-full text-left px-4 py-3 text-xs hover:bg-brand/10 hover:text-brand transition-colors ${selectedFramework === f.id ? 'bg-brand/10 text-brand' : 'text-text-primary'}`}>
                  {f.name}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => handlePdfExport()} disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-surface border border-border-subtle text-text-secondary rounded-lg text-xs hover:text-text-primary hover:border-brand/20 transition-all disabled:opacity-50">
            <Download size={13} /> PDF
          </button>
          <button onClick={() => handleExport('html')} disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white font-semibold rounded-lg text-xs hover:bg-brand-dark transition-all disabled:opacity-50">
            <Download size={13} /> {isExporting ? 'Exporting...' : 'HTML'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricWidget label="Total Findings" value={totalFindings} icon={AlertTriangle} iconColor="#EF4444" iconBg="rgba(239,68,68,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, totalFindings + Math.floor(Math.random() * 4 - 2)))} sparkColor="#EF4444" />
        <MetricWidget label="Failed Controls" value={failedControls} icon={Shield} iconColor="#F97316" iconBg="rgba(249,115,22,0.1)" sparkData={Array.from({ length: 7 }, () => Math.max(0, failedControls + Math.floor(Math.random() * 3 - 1)))} sparkColor="#F97316" />
        <GlassCard variant="elevated" className="p-4 flex items-center gap-4">
          <ProgressRing value={postureScore} max={100} size={80} strokeWidth={7} label="Score" />
          <div>
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Compliance Posture</span>
            <p className="text-lg font-bold text-text-primary mt-1">{posture}</p>
            <p className="text-[11px] text-text-muted">{frameworks.find(f => f.id === selectedFramework)?.name}</p>
          </div>
        </GlassCard>
      </div>

      {/* Coverage Notes */}
      <GlassCard variant="default" className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Evidence & Coverage</h3>
          <span className="text-[10px] text-text-muted bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full">Evidence-first exports</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="metric-card p-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Mapped Controls</p>
            <p className="text-lg font-bold text-text-primary">OWASP / GDPR / HIPAA</p>
            <p className="text-[10px] text-text-muted">Expandable to PCI, SOC 2, EU AI Act</p>
          </div>
          <div className="metric-card p-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Evidence Packages</p>
            <p className="text-lg font-bold text-brand">{totalFindings}</p>
            <p className="text-[10px] text-text-muted">Redacted payload + timeline</p>
          </div>
          <div className="metric-card p-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Retention</p>
            <p className="text-lg font-bold text-text-primary">90 days</p>
            <p className="text-[10px] text-text-muted">Configurable per tenant</p>
          </div>
        </div>
      </GlassCard>

      {/* Report Content */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden min-h-[400px]">
        {isLoading ? (
          <div className="p-6"><TableSkeleton columns={3} rows={8} /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-text-muted">
            <AlertTriangle size={40} className="mb-4 text-sev-critical" />
            <p className="text-sm">Failed to generate compliance summary.</p>
            <button onClick={() => refetch()} className="mt-3 text-xs text-brand hover:underline">Try again</button>
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {Object.entries(report?.sections || {}).map(([section, vulns]: [string, any]) => (
              <div key={section} className="space-y-3">
                <div className="flex items-center gap-3 border-b border-border-subtle pb-2">
                  <div className="w-6 h-6 rounded-lg bg-sev-critical/10 flex items-center justify-center">
                    <AlertTriangle size={12} className="text-sev-critical" />
                  </div>
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">{section}</h3>
                  <span className="ml-auto text-[10px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted">{vulns.length} Findings</span>
                </div>
                <div className="space-y-2">
                  {vulns.map((v: any) => {
                    const sevColor = v.severity === 'HIGH' || v.severity === 'CRITICAL' ? '#EF4444' : v.severity === 'MEDIUM' ? '#F97316' : '#EAB308';
                    return (
                      <div key={v.id} className="data-row-interactive p-4 rounded-lg flex items-center justify-between" style={{ borderLeftColor: sevColor }}>
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: sevColor }} />
                          <div>
                            <p className="text-[12px] font-medium text-text-primary">{v.title}</p>
                            <p className="text-[10px] text-text-muted font-mono mt-0.5">{v.endpoint}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color: sevColor, background: `${sevColor}12`, borderColor: `${sevColor}25` }}>
                          {v.severity}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {Object.keys(report?.sections || {}).length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                <CheckCircle size={40} className="mb-4 text-sev-low/30" />
                <p className="text-sm font-medium">No compliance violations found for this framework.</p>
                <p className="text-[11px] mt-1">Your API security posture satisfies all required controls.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
