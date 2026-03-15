import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSecurityEvents,
  fetchSecurityEventFilters,
  fetchThreatActors,
  fetchThreatActorFilters,
  modifyThreatActorStatus,
  fetchThreatCategoryCount,
  fetchCountBySeverity,
  getDailyThreatActorsCount,
  getActorsGeoCount,
  fetchThreatTopN,
} from '@/services/protection.service';

export function useSecurityEvents(
  page: number = 0,
  pageSize: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
  startTs?: number,
  endTs?: number,
) {
  return useQuery({
    queryKey: ['protection', 'events', page, pageSize, sortKey, sortOrder, filters, startTs, endTs],
    queryFn: ({ signal }) =>
      fetchSecurityEvents(page * pageSize, pageSize, sortKey, sortOrder, filters, startTs, endTs, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useSecurityEventFilters() {
  return useQuery({
    queryKey: ['protection', 'eventFilters'],
    queryFn: ({ signal }) => fetchSecurityEventFilters(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useThreatActors(
  page: number = 0,
  pageSize: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
  startTs?: number,
  endTs?: number,
) {
  return useQuery({
    queryKey: ['protection', 'actors', page, pageSize, sortKey, sortOrder, filters, startTs, endTs],
    queryFn: ({ signal }) =>
      fetchThreatActors(page * pageSize, pageSize, sortKey, sortOrder, filters, startTs, endTs, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useThreatActorFilters() {
  return useQuery({
    queryKey: ['protection', 'actorFilters'],
    queryFn: ({ signal }) => fetchThreatActorFilters(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useModifyActorStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ actorId, status }: { actorId: string; status: string }) =>
      modifyThreatActorStatus(actorId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protection'] });
    },
  });
}

export function useThreatCategoryCount(startTs?: number, endTs?: number) {
  return useQuery({
    queryKey: ['protection', 'categoryCount', startTs, endTs],
    queryFn: ({ signal }) => fetchThreatCategoryCount(startTs, endTs, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useSeverityCount(startTs?: number, endTs?: number) {
  return useQuery({
    queryKey: ['protection', 'severityCount', startTs, endTs],
    queryFn: ({ signal }) => fetchCountBySeverity(startTs, endTs, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useDailyThreatCount(startTs: number, endTs: number) {
  return useQuery({
    queryKey: ['protection', 'dailyCount', startTs, endTs],
    queryFn: ({ signal }) => getDailyThreatActorsCount(startTs, endTs, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useActorsGeoCount() {
  return useQuery({
    queryKey: ['protection', 'geoCount'],
    queryFn: ({ signal }) => getActorsGeoCount(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useThreatTopN(startTs?: number, endTs?: number) {
  return useQuery({
    queryKey: ['protection', 'topN', startTs, endTs],
    queryFn: ({ signal }) => fetchThreatTopN(startTs, endTs, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}
