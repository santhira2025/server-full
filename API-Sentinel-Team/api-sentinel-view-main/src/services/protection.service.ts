import { get, post } from '@/lib/api-client';

/* ───── Types for New Engine ───── */

export interface AktoMaliciousEvent {
  id: string;
  actor: string;
  filterId: string;
  ip: string;
  apiCollectionId: number;
  url: string;
  method: string;
  timestamp: number;
  severity: string;
  country?: string;
  category?: string;
  subCategory?: string;
}

export interface AktoThreatActor {
  id: string;
  latestApiIp: string;
  latestApiAttackType: string[];
  discoveredAt: number;
  lastSeenAt: number;
  country: string;
  actorStatus: string;          // BLOCKED, MONITORING, WHITELISTED
  severity: string;
  totalRequests: number;
  riskScore?: number;
}

/* ───── Security Events (WAF + Anomalies + Threat Engine) ───── */

export async function fetchSecurityEvents(
  skip: number = 0,
  limit: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
  startTs?: number,
  endTs?: number,
  signal?: AbortSignal,
) {
  let url = `/threat-actors/events?limit=${limit}`;
  if (startTs) url += `&start_ts=${startTs}`;
  if (endTs) url += `&end_ts=${endTs}`;

  const data = await get<any>(url, signal);

  const allEvents: AktoMaliciousEvent[] = (data.events || []).map((e: any) => ({
    id: e.id,
    actor: e.ip || e.actor_id || 'unknown',
    filterId: e.category || e.event_type || '-',
    ip: e.ip || e.actor_id || 'unknown',
    apiCollectionId: 1000000,
    url: e.url || e.path || '/',
    method: e.method || 'GET',
    timestamp: e.timestamp || Date.now(),
    severity: e.severity || 'MEDIUM',
    category: e.category || e.event_type,
    subCategory: e.subCategory,
  }));

  return {
    maliciousEvents: allEvents,
    total: data.total || allEvents.length,
  };
}

export async function getDailyThreatActorsCount(startTs: number, endTs: number, signal?: AbortSignal) {
  let url = `/threat-actors/trend?`;
  if (startTs) url += `&start_ts=${startTs}`;
  if (endTs) url += `&end_ts=${endTs}`;

  return get<{ threatTrend: { ts: number; count: number }[] }>(url, signal);
}

export async function fetchThreatActors(
  skip: number = 0,
  limit: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
  startTs?: number,
  endTs?: number,
  signal?: AbortSignal,
) {
  const raw = await get<any>(`/threat-actors/?limit=${limit}`, signal);
  const data = Array.isArray(raw) ? raw : (raw?.actors ?? []);
  const totalCount = raw?.total ?? data.length;

  const actors: AktoThreatActor[] = (data || []).map((a: any) => ({
    id: a.source_ip,
    latestApiIp: a.source_ip,
    latestApiAttackType: ['Suspicious Behavior'],
    discoveredAt: new Date(a.first_seen).getTime(),
    lastSeenAt: new Date(a.last_seen || a.first_seen).getTime(),
    country: 'Unknown',
    actorStatus: a.status || 'MONITORING',
    severity: a.risk_score > 7 ? 'HIGH' : a.risk_score > 3 ? 'MEDIUM' : 'LOW',
    totalRequests: a.event_count || 0,
    riskScore: a.risk_score
  }));

  return {
    threatActors: actors,
    total: totalCount,
  };
}

export async function modifyThreatActorStatus(actorId: string, status: string, signal?: AbortSignal) {
  const endpoint = status.toUpperCase() === 'BLOCKED' ? 'block' : 'whitelist';
  return post(`/threat-actors/${actorId}/${endpoint}`, {}, signal);
}

export async function fetchThreatCategoryCount(startTs?: number, endTs?: number, signal?: AbortSignal) {
  const events = await fetchSecurityEvents(0, 500, undefined, undefined, undefined, startTs, endTs, signal);
  const counts: Record<string, number> = {};
  events.maliciousEvents.forEach(e => {
    const cat = e.category || 'Other';
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return { categoryCount: counts };
}

export async function fetchCountBySeverity(startTs?: number, endTs?: number, signal?: AbortSignal) {
  const events = await fetchSecurityEvents(0, 500, undefined, undefined, undefined, startTs, endTs, signal);
  const counts: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  events.maliciousEvents.forEach(e => {
    const sev = e.severity.toUpperCase();
    if (counts[sev] !== undefined) counts[sev]++;
  });
  return { severityCount: counts };
}

export async function getActorsGeoCount(signal?: AbortSignal) {
  return get<{ countPerCountry: Record<string, number> }>('/threat-actors/geo', signal);
}

export async function fetchSecurityEventFilters(signal?: AbortSignal) {
  const data = await get<any>('/threat-actors/filters', signal);
  return {
    actors: data.ips || [],
    types: data.types || [],
  };
}

export async function fetchThreatActorFilters(signal?: AbortSignal) {
  return fetchSecurityEventFilters(signal); // Reuse IP based filters
}

export async function fetchThreatTopN(startTs?: number, endTs?: number, signal?: AbortSignal) {
  let url = '/threat-actors/top-n?limit=10';
  if (startTs) url += `&start_ts=${startTs}`;
  if (endTs) url += `&end_ts=${endTs}`;

  const data = await get<any>(url, signal);
  return {
    topApis: data.top_apis || [],
    topHosts: data.top_hosts || [],
  };
}

