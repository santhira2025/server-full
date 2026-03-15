import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchModuleInfo,
  fetchTeamData,
  fetchCustomRoles,
  fetchAuditLogs,
  fetchTrafficAlerts,
  dismissTrafficAlert,
  fetchThreatConfiguration,
  modifyThreatConfiguration,
} from '@/services/admin.service';

export function useModuleInfo() {
  return useQuery({
    queryKey: ['admin', 'modules'],
    queryFn: ({ signal }) => fetchModuleInfo(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useTeamData() {
  return useQuery({
    queryKey: ['admin', 'team'],
    queryFn: ({ signal }) => fetchTeamData(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useCustomRoles() {
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: ({ signal }) => fetchCustomRoles(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useAuditLogs(page: number = 0, pageSize: number = 50) {
  return useQuery({
    queryKey: ['admin', 'auditLogs', page, pageSize],
    queryFn: ({ signal }) => fetchAuditLogs(page * pageSize, pageSize, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useTrafficAlerts() {
  return useQuery({
    queryKey: ['admin', 'trafficAlerts'],
    queryFn: ({ signal }) => fetchTrafficAlerts(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => dismissTrafficAlert(alertId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'trafficAlerts'] });
    },
  });
}

export function useThreatConfig() {
  return useQuery({
    queryKey: ['admin', 'threatConfig'],
    queryFn: ({ signal }) => fetchThreatConfiguration(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useUpdateThreatConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) => modifyThreatConfiguration(config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'threatConfig'] });
    },
  });
}
