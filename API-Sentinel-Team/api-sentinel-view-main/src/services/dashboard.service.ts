import { get, post } from '@/lib/api-client';
import { fetchIssueSummary, fetchAllIssues } from './testing.service';
import { fetchEndpointsCount } from './discovery.service';
import { fetchSecurityEvents } from './protection.service';

/* ───── Types for New Dashboard ───── */

export interface DashboardHistorical {
  totalApis: number;
  newApis: number;
  criticalIssues: number;
  highIssues: number;
  totalThreats: number;
  blockedThreats: number;
  resolvedIssues: number;
  unauthApis: number;
}

/* ───── API Summary Logic ───── */

export async function fetchTotalIssues(signal?: AbortSignal) {
  const summary = await fetchIssueSummary(signal);
  return {
    totalIssues: summary.totalIssues,
    openIssues: summary.openIssues,
    criticalIssues: summary.severityBreakdown.CRITICAL || 0
  };
}

export async function fetchHistoricalData(signal?: AbortSignal): Promise<DashboardHistorical> {
  const [endpoints, issues, security] = await Promise.all([
    fetchEndpointsCount(signal),
    fetchIssueSummary(signal),
    fetchSecurityEvents(0, 500, undefined, undefined, undefined, undefined, undefined, signal)
  ]);

  const unauthCount = security.maliciousEvents.filter(
    e => e.category === 'Broken Auth' || e.category === 'JWT Forgery' || e.category === 'Broken Authentication'
  ).length;

  return {
    totalApis: endpoints.endpointsCount,
    newApis: endpoints.endpointsCount,
    criticalIssues: issues.severityBreakdown.CRITICAL || 0,
    highIssues: issues.severityBreakdown.HIGH || 0,
    totalThreats: security.total,
    blockedThreats: security.maliciousEvents.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL').length,
    resolvedIssues: issues.fixedIssues,
    unauthApis: unauthCount,
  };
}

export async function fetchIssuesByApis(signal?: AbortSignal) {
  const issues = await fetchAllIssues(0, 500, undefined, undefined, undefined, signal);
  const counts: Record<string, number> = {};

  issues.issues.forEach(i => {
    const key = `${i.method} ${i.url}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  return {
    issuesByApis: Object.entries(counts).map(([key, count]) => {
      const [method, url] = key.split(' ');
      return { url, method, count };
    })
  };
}

/* ───── Stubs for visual parts ───── */

export async function fetchIssuesTrend(startTs: number, endTs: number, signal?: AbortSignal) {
  try {
    const res = await get<any>(`/threat-actors/trend?start_ts=${startTs}&end_ts=${endTs}`, signal);
    return { issuesTrend: res.issuesTrend || [] };
  } catch {
    return { issuesTrend: [] };
  }
}

export async function fetchCriticalIssuesTrend(startTs: number, endTs: number, signal?: AbortSignal) {
  // Filters only CRITICAL severity issues over time
  // Returns trend data points: [{ ts: number, count: number }]
  try {
    const issues = await fetchAllIssues(0, 500, undefined, 'CRITICAL', undefined, signal);
    // Group by day
    const buckets: Record<number, number> = {};
    issues.issues.forEach((issue: any) => {
      const day = Math.floor((issue.created_at || Date.now() / 1000) / 86400) * 86400;
      buckets[day] = (buckets[day] || 0) + 1;
    });
    return {
      criticalTrend: Object.entries(buckets)
        .map(([ts, count]) => ({ ts: Number(ts), count }))
        .sort((a, b) => a.ts - b.ts),
    };
  } catch {
    return { criticalTrend: [] };
  }
}

export async function fetchEndpointDiscoveryData(signal?: AbortSignal) {
  return { discoveryData: {} };
}

export async function fetchTestingData(signal?: AbortSignal) {
  return { testingData: {} };
}

export async function fetchThreatData(signal?: AbortSignal) {
  try {
    const raw = await get<any>('/threat-actors/?limit=500', signal);
    const actors: any[] = Array.isArray(raw) ? raw : (raw?.actors ?? []);
    const total = raw?.total ?? actors.length;
    return {
      threatData: {
        totalActors: total,
        blockedActors: actors.filter(a => a.status === 'BLOCKED').length,
        whitelistedActors: actors.filter(a => a.status === 'WHITELISTED').length,
        highActors: actors.filter(a => a.risk_score > 7).length,
        mediumActors: actors.filter(a => a.risk_score > 3 && a.risk_score <= 7).length,
        lowActors: actors.filter(a => a.risk_score <= 3).length,
      },
    };
  } catch {
    return { threatData: { totalActors: 0, blockedActors: 0, whitelistedActors: 0, highActors: 0, mediumActors: 0, lowActors: 0 } };
  }
}

