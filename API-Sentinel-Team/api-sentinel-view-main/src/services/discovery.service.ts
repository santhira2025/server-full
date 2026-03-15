import { get, post } from '@/lib/api-client';

/* ───── Types for the New Engine ───── */

export interface AktoApiCollection {
  id: number;
  displayName: string;
  hostName: string;
  urlsCount: number;
  startTs: number;
  type: string;
}

export interface AktoApiInfo {
  id: { apiCollectionId: number; url: string; method: string };
  allAuthTypesFound: string[];
  lastSeen: number;
  discoveredAt?: number;
  riskScore?: number;
  apiAccessTypes?: string[];
}

/* ───── API Calls ───── */

/**
 * Maps our /collections/ into the AktoApiCollection shape for the UI
 */
export async function fetchApiCollections(signal?: AbortSignal) {
  const raw = await get<any>('/collections/', signal);

  // Server returns { total, collections: [] } — normalise to array
  const data: any[] = Array.isArray(raw) ? raw : (raw?.collections ?? []);

  if (!data || data.length === 0) {
    // Fallback if no collections exist yet
    return {
      apiCollections: [
        {
          id: 1000000,
          displayName: 'Default Inventory',
          hostName: 'all-hosts',
          urlsCount: 0,
          startTs: Date.now(),
          type: 'MIRRORING',
        },
      ],
    };
  }

  const apiCollections: AktoApiCollection[] = data.map(c => ({
    id: c.id,
    displayName: c.name,
    hostName: 'internal',
    urlsCount: 0, // In a real scenario, we'd fetch counts per collection
    startTs: new Date(c.created_at).getTime(),
    type: c.type || 'MIRRORING',
  }));

  return { apiCollections };
}

/**
 * Fetches refined endpoint list from our logic
 */
export async function fetchApiInfosForCollection(
  apiCollectionId: number,
  skip: number = 0,
  limit: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const data = await get<{ total: number; endpoints: any[] }>('/endpoints/', signal);

  // Transform our APIEndpoint into Akto's AktoApiInfo shape
  const apiInfoList: AktoApiInfo[] = (data.endpoints || []).map((e) => ({
    id: {
      apiCollectionId: 1000000,
      url: e.path,
      method: e.method,
    },
    allAuthTypesFound: [],
    lastSeen: new Date(e.last_seen).getTime(),
    discoveredAt: new Date(e.last_seen).getTime(),
    riskScore: 0,
  }));

  return {
    apiInfoList,
    total: data.total || 0,
  };
}

export async function fetchEndpointsCount(signal?: AbortSignal) {
  const data = await get<{ total: number }>('/endpoints/', signal);
  return { endpointsCount: data.total || 0 };
}

/* ───── Stubs for other discovery parts ───── */

export async function fetchSeverityCounts(apiCollectionIds: number[], signal?: AbortSignal) {
  return { severitiesCountResponse: [] };
}

export async function fetchRecentEndpoints(startTs: number, endTs: number, signal?: AbortSignal) {
  const data = await fetchApiInfosForCollection(1000000, 0, 10, undefined, undefined, undefined, signal);
  return { endpoints: data.apiInfoList };
}

export async function fetchAccessTypes(apiCollectionId: number, signal?: AbortSignal) {
  return { accessTypes: {} };
}

export async function fetchNewEndpointsTrend(
  period: 'HOST' | 'NON_HOST',
  startTs: number,
  endTs: number,
  signal?: AbortSignal,
) {
  return { trend: [] };
}

export async function fetchGovernanceEvents(
  skip: number = 0,
  limit: number = 50,
  filters?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return { auditDataList: [], total: 0 };
}

export async function fetchApiStats(signal?: AbortSignal) {
  return { apiStats: {} };
}

export async function fetchCollectionWiseEndpoints(signal?: AbortSignal) {
  return { response: {} };
}

/* ───── Sensitive Parameters (PII) ───── */

export interface AktoSensitiveParam {
  apiCollectionId: number;
  url: string;
  method: string;
  subType: string;
  isHeader: boolean;
  param: string;
  count?: number;
}

export async function fetchSensitiveParameters(
  skip: number = 0,
  limit: number = 50,
  signal?: AbortSignal,
) {
  const data = await get<{ findings: any[] }>('/pii/', signal);

  const endpoints: AktoSensitiveParam[] = (data.findings || []).map((f) => ({
    apiCollectionId: 1000000,
    url: f.url || '/',
    method: f.method || 'GET',
    subType: f.entity_type,
    isHeader: false,
    param: f.matched_text,
    count: 1,
  }));

  return {
    data: { endpoints },
    total: endpoints.length,
  };
}

export async function fetchSensitiveInfoForCollections(signal?: AbortSignal) {
  return { sensitiveInfo: {} };
}

