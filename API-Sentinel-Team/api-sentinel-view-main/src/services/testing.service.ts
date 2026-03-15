import { get, post } from '@/lib/api-client';

/* ───── Types for New Engine ───── */

export interface AktoIssue {
  id: string;
  creationTime: number;
  severity: string;                     // HIGH, MEDIUM, LOW, CRITICAL
  testSubType: string;
  testCategory: string;
  issueStatus: string;                  // OPEN, IGNORED, FIXED, FALSE_POSITIVE
  url: string;
  method: string;
  apiCollectionId: number;
  lastSeen: number;
}

export interface AktoIssueSummary {
  totalIssues: number;
  openIssues: number;
  fixedIssues: number;
  severityBreakdown: Record<string, number>;
}

/* ───── API Calls ───── */

export async function fetchAllIssues(
  skip: number = 0,
  limit: number = 50,
  filters?: Record<string, unknown>,
  sortKey?: string,
  sortOrder?: number,
  signal?: AbortSignal,
) {
  const data = await get<{ total: number; vulnerabilities: any[] }>('/vulnerabilities/', signal);

  const issues: AktoIssue[] = (data.vulnerabilities || []).map((v) => ({
    id: v.id,
    creationTime: Date.now(),
    severity: v.severity || 'LOW',
    testSubType: v.type || 'Generic Vulnerability',
    testCategory: v.category || 'Security',
    issueStatus: v.status || 'OPEN',
    url: v.url || '/',
    method: v.method || 'GET',
    apiCollectionId: 1000000,
    lastSeen: Date.now(),
  }));

  return {
    issues,
    totalIssuesCount: data.total || 0,
  };
}

export async function fetchIssueSummary(signal?: AbortSignal) {
  const data = await fetchAllIssues(0, 1000, undefined, undefined, undefined, signal);

  const breakdown: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  data.issues.forEach(i => {
    if (breakdown[i.severity] !== undefined) breakdown[i.severity]++;
  });

  return {
    totalIssues: data.totalIssuesCount,
    openIssues: data.issues.filter(i => i.issueStatus === 'OPEN').length,
    fixedIssues: data.issues.filter(i => i.issueStatus === 'FIXED').length,
    severityBreakdown: breakdown,
  };
}

export async function fetchSeverityInfoForIssues(signal?: AbortSignal) {
  const summary = await fetchIssueSummary(signal);
  return { severityInfo: summary.severityBreakdown };
}

export async function fetchVulnerableRequests(
  skip: number = 0,
  limit: number = 50,
  filters?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  // Similar to fetchAllIssues but mapped to AktoTestRunResult
  const data = await fetchAllIssues(skip, limit, filters, undefined, undefined, signal);
  return {
    testingRunResults: data.issues.map(i => ({
      hexId: i.id,
      testSubType: i.testSubType,
      testCategory: i.testCategory,
      apiInfoKey: { url: i.url, method: i.method, apiCollectionId: 1000000 },
      vulnerable: true,
    })),
    total: data.totalIssuesCount,
  };
}

export async function updateIssueStatus(issueId: string, status: string, signal?: AbortSignal) {
  return post(`/vulnerabilities/${issueId}/status`, { status }, signal);
}

export async function bulkUpdateIssueStatus(issueIds: string[], status: string, signal?: AbortSignal) {
  return post('/vulnerabilities/bulk-status', { issue_ids: issueIds, status }, signal);
}

export async function fetchIssuesByDay(startTs: number, endTs: number, signal?: AbortSignal) {
  let url = '/vulnerabilities/trend?';
  if (startTs) url += `&start_ts=${startTs}`;
  if (endTs) url += `&end_ts=${endTs}`;
  return get<{ issuesTrend: { ts: number; count: number }[] }>(url, signal);
}

export async function fetchAllSubCategories(signal?: AbortSignal) {
  const data = await get<{ templates: any[] }>('/tests/templates', signal);
  return {
    subCategories: (data.templates || []).map(t => ({
      name: t.name,
      superCategory: { name: t.category || 'Vulnerability' }
    }))
  };
}

/* ───── Run Logic ───── */

export async function startTestSelection(
  templateIds: string[],
  endpointIds: { url: string, method: string, apiCollectionId: number }[],
  signal?: AbortSignal
) {
  return post('/tests/run', {
    template_ids: templateIds,
    endpoint_ids: endpointIds.map(e => `${e.method} ${e.url}`) // simplified for the stub
  }, signal);
}

/* ───── Reports ───── */

export async function generateReportPDF(
  framework: string = 'OWASP_API_2023',
  format: string = 'html',
  signal?: AbortSignal,
) {
  // Use the new compliance export endpoint
  // Note: if format is HTML, backend returns HTMLResponse. 
  // If JSON, it returns the report JSON.
  return get<any>(`/compliance/reports/${framework}/export?format=${format}`, signal);
}

export async function fetchComplianceReport(framework: string = 'OWASP_API_2023', signal?: AbortSignal) {
  return get<any>(`/compliance/reports/${framework}`, signal);
}

export async function downloadReportPDF(reportId: string, signal?: AbortSignal) {
  return { downloadUrl: `/api/compliance/reports/${reportId}/export?format=html` };
}

