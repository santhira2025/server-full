export type Severity = 'critical' | 'major' | 'minor' | 'high' | 'medium' | 'low' | 'info';
export type EventStatus = 'open' | 'false_positive' | 'analyzed' | 'risk_accepted' | 'resolved';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
export type AuthType = 'Authenticated' | 'Unauth';
export type ScanType = 'ActiveScan' | 'PassiveScan' | 'RuntimeScan';
export type ThreatState = 'block' | 'timed_block' | 'monitor' | 'whitelist';
export type ThreatLevel = 'high' | 'medium' | 'low';

export interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  host: string;
  firstDiscovered: string;
  lastObserved: string;
  auth: AuthType;
  riskScore: Severity;
  notes: string;
  characteristics: string[];
}

export interface Vulnerability {
  id: string;
  severity: Severity;
  severityNum: number;
  method: HttpMethod;
  endpoint: string;
  timestamp: string;
  eventId: number;
  category: ScanType;
  subCategory: string;
  summary: string;
  status: EventStatus;
  lastObserved: string;
}

export interface SecurityEvent {
  id: string;
  severity: Severity;
  action: string;
  method: HttpMethod;
  endpoint: string;
  timestamp: string;
  eventId: number;
  httpResponse: number;
  category: string;
  subCategory: string;
  summary: string;
}

export interface ThreatActor {
  id: string;
  monitoredUser: string;
  risk: ThreatLevel;
  attempts: number;
  tactics: string[];
  techniques: string[];
  geolocation: string;
  state: ThreatState;
  lastStateTransition: string;
  firstDiscovered: string;
}

export interface GovernanceEvent {
  id: string;
  severity: Severity;
  endpoint: string;
  timestamp: string;
  eventId: number;
  subCategory: string;
  summary: string;
  status: string;
}

export interface Report {
  id: string;
  title: string;
  type: string;
  requestedBy: string;
  requestedDate: string;
  occurrence: string;
  durationFrom: string;
  durationTo: string;
  status: string;
}

export interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

export interface MetricCard {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}
