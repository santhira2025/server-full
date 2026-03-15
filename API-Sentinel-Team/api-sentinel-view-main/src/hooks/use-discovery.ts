import { useQuery } from '@tanstack/react-query';
import {
  fetchApiCollections,
  fetchApiInfosForCollection,
  fetchSeverityCounts,
  fetchEndpointsCount,
  fetchRecentEndpoints,
  fetchAccessTypes,
  fetchGovernanceEvents,
  fetchApiStats,
  fetchSensitiveParameters,
  fetchSensitiveInfoForCollections,
} from '@/services/discovery.service';

export function useApiCollections() {
  return useQuery({
    queryKey: ['discovery', 'collections'],
    queryFn: ({ signal }) => fetchApiCollections(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useApiInfos(
  collectionId: number | null,
  page: number = 0,
  pageSize: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
) {
  return useQuery({
    queryKey: ['discovery', 'apiInfos', collectionId, page, pageSize, sortKey, sortOrder, filters],
    queryFn: ({ signal }) =>
      fetchApiInfosForCollection(collectionId!, page * pageSize, pageSize, sortKey, sortOrder, filters, signal),
    enabled: collectionId !== null,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useSeverityCounts(apiCollectionIds: number[]) {
  return useQuery({
    queryKey: ['discovery', 'severityCounts', apiCollectionIds],
    queryFn: ({ signal }) => fetchSeverityCounts(apiCollectionIds, signal),
    enabled: apiCollectionIds.length > 0,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useEndpointsCount() {
  return useQuery({
    queryKey: ['discovery', 'endpointsCount'],
    queryFn: ({ signal }) => fetchEndpointsCount(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useRecentEndpoints(startTs: number, endTs: number) {
  return useQuery({
    queryKey: ['discovery', 'recent', startTs, endTs],
    queryFn: ({ signal }) => fetchRecentEndpoints(startTs, endTs, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useAccessTypes(apiCollectionId: number | null) {
  return useQuery({
    queryKey: ['discovery', 'accessTypes', apiCollectionId],
    queryFn: ({ signal }) => fetchAccessTypes(apiCollectionId!, signal),
    enabled: apiCollectionId !== null,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useGovernanceEvents(
  page: number = 0,
  pageSize: number = 50,
  filters?: Record<string, unknown>,
) {
  return useQuery({
    queryKey: ['discovery', 'governance', page, pageSize, filters],
    queryFn: ({ signal }) => fetchGovernanceEvents(page * pageSize, pageSize, filters, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useApiStats() {
  return useQuery({
    queryKey: ['discovery', 'apiStats'],
    queryFn: ({ signal }) => fetchApiStats(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useSensitiveParameters(page: number = 0, pageSize: number = 50) {
  return useQuery({
    queryKey: ['discovery', 'sensitiveParams', page, pageSize],
    queryFn: ({ signal }) => fetchSensitiveParameters(page * pageSize, pageSize, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useSensitiveInfoForCollections() {
  return useQuery({
    queryKey: ['discovery', 'sensitiveInfo'],
    queryFn: ({ signal }) => fetchSensitiveInfoForCollections(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}
