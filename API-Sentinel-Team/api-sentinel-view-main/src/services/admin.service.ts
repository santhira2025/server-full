import { post } from '@/lib/api-client';

/* ───── Types from Akto ───── */

export interface AktoModuleInfo {
  id: string;
  moduleName: string;
  currentVersion: string;
  lastHeartbeat: number;
  lastMirrored: number;
  state: string;               // RUNNING, STOPPED
  isConnected: boolean;
  hostName?: string;
  ipAddress?: string;
  policyVersion?: string;
}

export interface AktoTeamMember {
  login: string;
  name?: string;
  role: string;
  lastLoginTs?: number;
}

export interface AktoRole {
  name: string;
  baseRole?: string;
  apiCollectionIds?: number[];
}

export interface AktoAuditLog {
  id: string;
  user: string;
  action: string;
  timestamp: number;
  details?: string;
  resource?: string;
}

/* ───── Module / System Health ───── */

export async function fetchModuleInfo(signal?: AbortSignal) {
  return post<{ moduleInfos: AktoModuleInfo[] }>('/fetchModuleInfo', {}, signal);
}

export async function rebootModules(moduleIds: string[], signal?: AbortSignal) {
  return post('/rebootModules', { moduleIds }, signal);
}

export async function deleteModuleInfo(moduleId: string, signal?: AbortSignal) {
  return post('/deleteModuleInfo', { moduleId }, signal);
}

/* ───── Team / Users ───── */

export async function fetchTeamData(signal?: AbortSignal) {
  return post<{ users: AktoTeamMember[]; pendingInvitees: string[] }>(
    '/getTeamData',
    {},
    signal,
  );
}

export async function fetchCustomRoles(signal?: AbortSignal) {
  return post<{ customRoles: AktoRole[] }>('/getCustomRoles', {}, signal);
}

export async function createCustomRole(
  roleName: string,
  baseRole: string,
  apiCollectionIds: number[],
  signal?: AbortSignal,
) {
  return post(
    '/createCustomRole',
    { roleName, baseRole, apiCollectionIds },
    signal,
  );
}

export async function removeUser(email: string, signal?: AbortSignal) {
  return post('/removeUser', { email }, signal);
}

/* ───── Audit Logs ───── */

export async function fetchAuditLogs(
  skip: number = 0,
  limit: number = 50,
  signal?: AbortSignal,
) {
  return post<{ auditLogs: AktoAuditLog[]; total: number }>(
    '/fetchAuditData',
    { skip, limit },
    signal,
  );
}

/* ───── Admin Settings ───── */

export async function fetchAccountSettings(signal?: AbortSignal) {
  return post<{ accountSettings: Record<string, unknown> }>(
    '/getAccountSettingsForAdvancedFilters',
    {},
    signal,
  );
}

export async function modifyAccountSettings(settings: Record<string, unknown>, signal?: AbortSignal) {
  return post('/modifyAccountSettings', settings, signal);
}

/* ───── Traffic Alerts ───── */

export async function fetchTrafficAlerts(signal?: AbortSignal) {
  return post<{ trafficAlerts: Array<{ id: string; message: string; timestamp: number; dismissed: boolean }> }>(
    '/getAllTrafficAlerts',
    {},
    signal,
  );
}

export async function dismissTrafficAlert(alertId: string, signal?: AbortSignal) {
  return post('/markAlertAsDismissed', { alertId }, signal);
}

/* ───── Threat Configuration ───── */

export async function fetchThreatConfiguration(signal?: AbortSignal) {
  return post<{ threatConfiguration: Record<string, unknown> }>(
    '/fetchThreatConfiguration',
    {},
    signal,
  );
}

export async function modifyThreatConfiguration(config: Record<string, unknown>, signal?: AbortSignal) {
  return post('/modifyThreatConfiguration', config, signal);
}
