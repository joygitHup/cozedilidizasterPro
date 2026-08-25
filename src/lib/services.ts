import { apiFetch, type Paginated } from '@/lib/api-client';
import { setAuth, clearAuth, type AuthUser } from '@/lib/auth';
import type {
  DashboardStats,
  DisasterStatistics,
  PerformanceStatistics,
  DevicePayload,
  DeviceRelated,
  DeviceStats,
  DeviceTree,
  DeviceTreeNode,
  DeviceType,
  EmergencyPlan,
  EmergencyPlanPayload,
  EmergencyPlanRelated,
  EmergencyPlanStats,
  EvacuationGeoJSON,
  EvacuationRelated,
  EvacuationShelter,
  EcologyAssessment,
  EcologyAssessmentPayload,
  EcologyAssessmentStats,
  EcologyProgressBoardItem,
  EcologyProgressLog,
  EcologyProgressPayload,
  EcologyProgressStats,
  EcologyProject,
  EcologyProjectPayload,
  EcologyProjectRelated,
  EcologyProjectStats,
  EcologyProjectStatus,
  EcologyProjectType,
  EmergencySupply,
  EmergencySupplyPayload,
  EmergencySupplyStats,
  EvacuationTask,
  EvacuationTaskPayload,
  EvacuationTaskStats,
  HazardPoint,
  PlanColorLevel,
  PlanLaunchResult,
  PlanResponseLevel,
  PlanStatus,
  HazardPointPayload,
  RegionTreeNode,
  HazardRelated,
  InspectionPriority,
  InspectionStatus,
  InspectionTask,
  InspectionTaskPayload,
  InspectionTaskStats,
  InspectionTaskType,
  MonitorDataOverview,
  MonitorDataType,
  MonitorIngestPayload,
  MonitorIngestResult,
  MonitorLatest,
  MonitorSeries,
  MonitorTimeRange,
  MonitoringDevice,
  RiskLevel,
  RiskSlope,
  RiskSlopePayload,
  RiskSlopeRelated,
  RiskSlopeStats,
  SystemUser,
  SystemUserPayload,
  TimelineEvent,
  WarningModelConfig,
  WarningModelPayload,
  WarningModelStats,
  WarningModelTestResult,
  WarningModelType,
  WarningRecord,
  WarningRelated,
  WarningStats,
} from '@/types';

/** ---------- Auth ---------- */
export async function login(username: string, password: string) {
  const data = await apiFetch<{
    access: string;
    refresh: string;
    user: AuthUser;
  }>('/api/users/login/', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ username, password }),
  });
  setAuth(data.access, data.refresh, data.user);
  try {
    const { fetchMyPermissions } = await import('@/lib/permissions');
    await fetchMyPermissions();
  } catch {
    /* 权限拉取失败不阻断登录 */
  }
  return data.user;
}

export async function logout() {
  const refresh = localStorage.getItem('geohazard_refresh');
  try {
    if (refresh) {
      await apiFetch('/api/users/logout/', {
        method: 'POST',
        body: JSON.stringify({ refresh }),
        skipRefresh: true,
      });
    }
  } finally {
    clearAuth();
  }
}

export async function fetchProfile() {
  return apiFetch<AuthUser>('/api/users/profile/');
}

/** ---------- Mappers ---------- */
function buildTimeline(w: Record<string, unknown>): WarningRecord['timeline'] {
  if (Array.isArray(w.timeline) && w.timeline.length) {
    return (w.timeline as Array<Record<string, unknown>>).map((e) => ({
      time: String(e.time || ''),
      event: String(e.event || ''),
      actor: e.actor ? String(e.actor) : undefined,
      status: (e.status as TimelineEvent['status']) || 'completed',
    }));
  }
  const events: WarningRecord['timeline'] = [
    { time: String(w.created_at || ''), event: '预警触发', status: 'completed' },
  ];
  if (w.confirm_time) {
    events.push({
      time: String(w.confirm_time),
      event: '值班确认',
      actor: String(w.confirm_user || ''),
      status: 'completed',
    });
  }
  if (w.publish_time) {
    events.push({
      time: String(w.publish_time),
      event: '发布预警',
      actor: String(w.publish_user || ''),
      status: 'completed',
    });
  }
  if (w.close_time) {
    events.push({ time: String(w.close_time), event: '闭环归档', status: 'completed' });
  } else {
    const last = events[events.length - 1];
    if (last) last.status = 'current';
  }
  return events;
}

function mapWarning(w: Record<string, unknown>): WarningRecord {
  const triggerValue = (w.trigger_value || {}) as Record<string, unknown>;
  return {
    id: String(w.code || w.id),
    dbId: Number(w.id),
    hazardPointId: String(w.hazard_code || w.hazard_point || ''),
    hazardPointDbId: w.hazard_point_id != null ? Number(w.hazard_point_id) : Number(w.hazard_point) || undefined,
    hazardPointName: String(w.hazard_name || ''),
    level: w.level as WarningRecord['level'],
    levelDisplay: String(w.level_display || ''),
    triggerType: String(w.trigger_type || ''),
    triggerValue,
    confidence: Number(w.confidence || 0),
    status: w.status as WarningRecord['status'],
    statusDisplay: String(w.status_display || ''),
    confirmTime: w.confirm_time ? String(w.confirm_time) : undefined,
    confirmUser: w.confirm_user ? String(w.confirm_user) : undefined,
    publishTime: w.publish_time ? String(w.publish_time) : undefined,
    publishUser: w.publish_user ? String(w.publish_user) : undefined,
    closeTime: w.close_time ? String(w.close_time) : undefined,
    closeReason: w.close_reason ? String(w.close_reason) : undefined,
    callStatus: (w.call_status as WarningRecord['callStatus']) || undefined,
    callDetail: (w.call_detail as Record<string, unknown>) || undefined,
    createTime: String(w.created_at || ''),
    updateTime: String(w.updated_at || w.created_at || ''),
    timeline: buildTimeline(w),
  };
}

function mapHazard(p: Record<string, unknown>): HazardPoint {
  return {
    id: String(p.id),
    code: String(p.code),
    name: String(p.name),
    type: p.type as HazardPoint['type'],
    level: p.level as HazardPoint['level'],
    status: p.status as HazardPoint['status'],
    location: {
      lng: Number(p.longitude || 0),
      lat: Number(p.latitude || 0),
      address: String(p.address || ''),
      city: String(p.city || ''),
      district: String(p.district || p.town || ''),
      village: String(p.village || ''),
      town: String(p.town || p.district || ''),
      county: String(p.county || ''),
    },
    scale: {
      volume: Number(p.volume || 0),
      length: Number(p.length || 0),
      width: Number(p.width || 0),
      height: Number(p.height || 0),
    },
    threat: {
      people: Number(p.threat_people || 0),
      houses: Number(p.threat_houses || 0),
      roads: Number(p.threat_roads || 0),
      assets: Number(p.threat_assets || 0),
    },
    coefficient: Number(p.stability_coefficient || 0),
    createTime: String(p.created_at || ''),
    updateTime: String(p.updated_at || ''),
    responsiblePerson: String(p.responsible_person || ''),
    contactPhone: String(p.contact_phone || ''),
    photos: Array.isArray(p.photos) ? (p.photos as string[]) : [],
    files: Array.isArray(p.files) ? (p.files as string[]) : [],
    deviceCount: p.device_count != null ? Number(p.device_count) : undefined,
    openWarningCount: p.open_warning_count != null ? Number(p.open_warning_count) : undefined,
    inspectionPendingCount:
      p.inspection_pending_count != null ? Number(p.inspection_pending_count) : undefined,
  };
}

function mapDevice(d: Record<string, unknown>): MonitoringDevice {
  return {
    id: String(d.id),
    dbId: Number(d.id),
    code: String(d.code || ''),
    name: String(d.name || d.code || ''),
    type: (d.device_type as DeviceType) || 'others',
    typeDisplay: String(d.device_type_display || d.device_type || ''),
    status: d.status as MonitoringDevice['status'],
    statusDisplay: String(d.status_display || d.status || ''),
    location: {
      lng: Number(d.longitude || 0),
      lat: Number(d.latitude || 0),
      address: String(d.address || ''),
      city: String(d.city || ''),
      district: String(d.district || d.town || ''),
      county: String(d.county || ''),
      village: String(d.village || ''),
      town: String(d.town || d.district || ''),
    },
    hazardPointId: d.hazard_point != null ? Number(d.hazard_point) : null,
    hazardPointName: String(d.hazard_point_name || ''),
    hazardPointCode: String(d.hazard_point_code || ''),
    installDate: String(d.install_date || ''),
    specs: {
      range: String(d.range_value || '-'),
      accuracy: String(d.accuracy || '-'),
      power: Number(d.power_consumption || 0),
    },
    battery: Number(d.battery || 0),
    signal: (d.signal as MonitoringDevice['signal']) || 'medium',
    signalDisplay: String(d.signal_display || d.signal || ''),
    lastDataTime: String(d.last_data_time || ''),
    isStale: Boolean(d.is_stale),
    lowBattery: Boolean(d.low_battery),
    dataCount: d.data_count != null ? Number(d.data_count) : undefined,
    data: [],
  };
}

function mapEvacuation(t: Record<string, unknown>): EvacuationTask {
  const levelMap: Record<string, string> = {
    red: '红色', orange: '橙色', yellow: '黄色', blue: '蓝色',
  };
  const level = String(t.hazard_point_level || '');
  const pathRaw = Array.isArray(t.route_path) ? t.route_path : [];
  const path = pathRaw
    .filter((c): c is [number, number] => Array.isArray(c) && c.length >= 2)
    .map((c) => [Number(c[0]), Number(c[1])] as [number, number]);
  const toNum = (v: unknown): number | null =>
    v === null || v === undefined || v === '' ? null : Number(v);
  return {
    id: String(t.code || t.id),
    dbId: Number(t.id),
    warningId: String(t.warning_code || t.warning || ''),
    warningDbId: t.warning != null ? Number(t.warning) : null,
    warningCode: String(t.warning_code || ''),
    warningLevel: String(t.warning_level || ''),
    hazardPointId: String(t.hazard_point_code || t.hazard_point || ''),
    hazardPointDbId: t.hazard_point != null ? Number(t.hazard_point) : null,
    pointName: String(t.hazard_point_name || ''),
    pointCode: String(t.hazard_point_code || ''),
    pointLevel: levelMap[level] || level,
    hazardLng: toNum(t.hazard_longitude),
    hazardLat: toNum(t.hazard_latitude),
    riskArea: String(t.shelter_address || ''),
    riskDesc: '',
    totalPeople: Number(t.total_people || 0),
    transferredPeople: Number(t.transferred_people || 0),
    completionRate: Number(t.completion_rate ?? 0),
    peopleList: [],
    commander: String(t.commander || ''),
    commanderPhone: String(t.commander_phone || ''),
    gridWorker: String(t.grid_worker || ''),
    gridPhone: String(t.grid_phone || ''),
    shelter: String(t.shelter_name || ''),
    shelterAddress: String(t.shelter_address || ''),
    shelterLng: toNum(t.shelter_longitude),
    shelterLat: toNum(t.shelter_latitude),
    route: {
      path,
      distance: Number(t.route_distance || 0),
      estimatedTime: Number(t.estimated_time || 0),
      provider: String(t.route_provider || '') || undefined,
    },
    status: t.status as EvacuationTask['status'],
    statusDisplay: String(t.status_display || t.status || ''),
    createTime: String(t.created_at || ''),
    updateTime: String(t.updated_at || ''),
  };
}

/** ---------- Business APIs ---------- */
export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/api/dashboard/overview/');
}

/** ---------- 统计分析 · 灾害统计 / 效能分析 ---------- */
export async function getDisasterStatistics(year?: number): Promise<DisasterStatistics> {
  const q = new URLSearchParams();
  if (year) q.set('year', String(year));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return apiFetch<DisasterStatistics>(`/api/statistics/disaster/${suffix}`);
}

export async function getPerformanceStatistics(
  year?: number
): Promise<PerformanceStatistics> {
  const q = new URLSearchParams();
  if (year) q.set('year', String(year));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return apiFetch<PerformanceStatistics>(`/api/statistics/performance/${suffix}`);
}

export async function getLatestWarnings(
  limit = 20,
  openOnly = true
): Promise<WarningRecord[]> {
  const q = new URLSearchParams();
  q.set('limit', String(limit));
  q.set('open_only', openOnly ? '1' : '0');
  const data = await apiFetch<Paginated<Record<string, unknown>> | Record<string, unknown>[]>(
    `/api/warning/records/latest/?${q.toString()}`
  );
  const list = Array.isArray(data) ? data : [];
  return list.map(mapWarning);
}

export async function getWarningList(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  level?: string;
  search?: string;
  openOnly?: boolean;
  statusGroup?: 'open' | 'pending' | 'processing' | 'closed';
}): Promise<{ list: WarningRecord[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 20));
  if (params?.status) q.set('status', params.status);
  if (params?.level) q.set('level', params.level);
  if (params?.search) q.set('search', params.search);
  if (params?.openOnly) q.set('open_only', '1');
  if (params?.statusGroup) q.set('status_group', params.statusGroup);
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/warning/records/?${q.toString()}`
  );
  return { list: data.results.map(mapWarning), total: data.count };
}

export async function getWarning(id: string | number): Promise<WarningRecord> {
  const data = await apiFetch<Record<string, unknown>>(`/api/warning/records/${id}/`);
  return mapWarning(data);
}

export async function getWarningStats(): Promise<WarningStats> {
  return apiFetch<WarningStats>('/api/warning/records/statistics/');
}

export async function getWarningRelated(id: string | number): Promise<WarningRelated> {
  return apiFetch<WarningRelated>(`/api/warning/records/${id}/related/`);
}

export async function deleteWarningRecord(id: string | number): Promise<void> {
  await apiFetch(`/api/warning/records/${id}/`, { method: 'DELETE' });
}

export async function getHazardPoints(params?: {
  page?: number;
  pageSize?: number;
  level?: string;
  status?: string;
  search?: string;
  cities?: string[];
  districts?: string[];
  counties?: string[];
  towns?: string[];
  villages?: string[];
}): Promise<{ list: HazardPoint[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 10));
  if (params?.level) q.set('level', params.level);
  if (params?.status) q.set('status', params.status);
  if (params?.search) q.set('search', params.search);
  if (params?.cities?.length) q.set('cities', params.cities.join(','));
  if (params?.districts?.length) q.set('districts', params.districts.join(','));
  if (params?.counties?.length) q.set('counties', params.counties.join(','));
  if (params?.towns?.length) q.set('towns', params.towns.join(','));
  if (params?.villages?.length) q.set('villages', params.villages.join(','));
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/hazard/points/?${q.toString()}`
  );
  return { list: data.results.map(mapHazard), total: data.count };
}

export async function getHazardPoint(id: string | number): Promise<HazardPoint> {
  const data = await apiFetch<Record<string, unknown>>(`/api/hazard/points/${id}/`);
  return mapHazard(data);
}

export async function createHazardPoint(payload: HazardPointPayload): Promise<HazardPoint> {
  const data = await apiFetch<Record<string, unknown>>('/api/hazard/points/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapHazard(data);
}

export async function updateHazardPoint(
  id: string | number,
  payload: Partial<HazardPointPayload>
): Promise<HazardPoint> {
  const data = await apiFetch<Record<string, unknown>>(`/api/hazard/points/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapHazard(data);
}

export async function deleteHazardPoint(id: string | number): Promise<void> {
  await apiFetch(`/api/hazard/points/${id}/`, { method: 'DELETE' });
}

export async function getHazardRegions(): Promise<RegionTreeNode[]> {
  const data = await apiFetch<RegionTreeNode[] | { results: RegionTreeNode[] }>(
    '/api/hazard/regions/'
  );
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function createHazardRegion(payload: {
  name: string;
  parent_id?: number | null;
  level?: 'city' | 'district' | 'county' | 'village' | string;
}): Promise<RegionTreeNode> {
  return apiFetch<RegionTreeNode>('/api/hazard/regions/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteHazardRegion(id: number): Promise<void> {
  await apiFetch(`/api/hazard/regions/${id}/`, { method: 'DELETE' });
}

export async function getHazardNextCode(): Promise<string> {
  const data = await apiFetch<{ code: string }>('/api/hazard/points/next_code/');
  return data.code;
}

export async function getHazardRelated(id: string | number): Promise<HazardRelated> {
  return apiFetch<HazardRelated>(`/api/hazard/points/${id}/related/`);
}

export async function changeHazardStatus(
  id: string | number,
  status: HazardPoint['status']
): Promise<HazardPoint> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/hazard/points/${id}/change_status/`,
    { method: 'POST', body: JSON.stringify({ status }) }
  );
  return mapHazard(data);
}

export async function exportHazardPoints(params?: {
  level?: string;
  status?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.level) q.set('level', params.level);
  if (params?.status) q.set('status', params.status);
  if (params?.search) q.set('search', params.search);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/hazard/points/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hazard_points.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function mapRiskSlope(s: Record<string, unknown>): RiskSlope {
  return {
    id: String(s.id),
    code: String(s.code),
    name: String(s.name),
    hazardPointId: s.hazard_point != null ? Number(s.hazard_point) : null,
    hazardPointName: String(s.hazard_point_name || ''),
    hazardPointCode: String(s.hazard_point_code || ''),
    riskLevel: s.risk_level as RiskLevel,
    riskLevelDisplay: String(s.risk_level_display || s.risk_level || ''),
    area: Number(s.area || 0),
    slopeAngle: Number(s.slope_angle || 0),
    description: String(s.description || ''),
    longitude: Number(s.longitude || 0),
    latitude: Number(s.latitude || 0),
    monitorCoverage: (s.monitor_coverage as RiskSlope['monitorCoverage']) || 'unlinked',
    monitorCoverageDisplay: String(s.monitor_coverage_display || ''),
    deviceCount: s.device_count != null ? Number(s.device_count) : undefined,
    openWarningCount: s.open_warning_count != null ? Number(s.open_warning_count) : undefined,
    createTime: String(s.created_at || ''),
    updateTime: String(s.updated_at || ''),
  };
}

export async function getRiskSlopes(params?: {
  page?: number;
  pageSize?: number;
  riskLevel?: string;
  search?: string;
  monitorCoverage?: string;
  hazardPoint?: number | string;
}): Promise<{ list: RiskSlope[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 10));
  if (params?.riskLevel) q.set('risk_level', params.riskLevel);
  if (params?.search) q.set('search', params.search);
  if (params?.monitorCoverage) q.set('monitor_coverage', params.monitorCoverage);
  if (params?.hazardPoint) q.set('hazard_point', String(params.hazardPoint));
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/hazard/slopes/?${q.toString()}`
  );
  return { list: data.results.map(mapRiskSlope), total: data.count };
}

export async function getRiskSlope(id: string | number): Promise<RiskSlope> {
  const data = await apiFetch<Record<string, unknown>>(`/api/hazard/slopes/${id}/`);
  return mapRiskSlope(data);
}

export async function createRiskSlope(payload: RiskSlopePayload): Promise<RiskSlope> {
  const data = await apiFetch<Record<string, unknown>>('/api/hazard/slopes/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapRiskSlope(data);
}

export async function updateRiskSlope(
  id: string | number,
  payload: Partial<RiskSlopePayload>
): Promise<RiskSlope> {
  const data = await apiFetch<Record<string, unknown>>(`/api/hazard/slopes/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapRiskSlope(data);
}

export async function deleteRiskSlope(id: string | number): Promise<void> {
  await apiFetch(`/api/hazard/slopes/${id}/`, { method: 'DELETE' });
}

export async function getRiskSlopeNextCode(): Promise<string> {
  const data = await apiFetch<{ code: string }>('/api/hazard/slopes/next_code/');
  return data.code;
}

export async function getRiskSlopeStats(): Promise<RiskSlopeStats> {
  return apiFetch<RiskSlopeStats>('/api/hazard/slopes/statistics/');
}

export async function getRiskSlopeRelated(id: string | number): Promise<RiskSlopeRelated> {
  return apiFetch<RiskSlopeRelated>(`/api/hazard/slopes/${id}/related/`);
}

export async function bindRiskSlopeHazard(
  id: string | number,
  hazardPointId: number,
  syncCoords = true
): Promise<RiskSlope> {
  const data = await apiFetch<Record<string, unknown>>(`/api/hazard/slopes/${id}/bind_hazard/`, {
    method: 'POST',
    body: JSON.stringify({ hazard_point: hazardPointId, sync_coords: syncCoords }),
  });
  return mapRiskSlope(data);
}

export async function changeRiskSlopeLevel(
  id: string | number,
  riskLevel: RiskLevel
): Promise<RiskSlope> {
  const data = await apiFetch<Record<string, unknown>>(`/api/hazard/slopes/${id}/change_level/`, {
    method: 'POST',
    body: JSON.stringify({ risk_level: riskLevel }),
  });
  return mapRiskSlope(data);
}

export async function exportRiskSlopes(params?: {
  riskLevel?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.riskLevel) q.set('risk_level', params.riskLevel);
  if (params?.search) q.set('search', params.search);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/hazard/slopes/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'risk_slopes.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function mapInspectionTask(t: Record<string, unknown>): InspectionTask {
  return {
    id: String(t.id),
    code: String(t.code || ''),
    title: String(t.title || ''),
    description: String(t.description || ''),
    taskType: (t.task_type as InspectionTaskType) || 'routine',
    taskTypeDisplay: String(t.task_type_display || t.task_type || ''),
    hazardPointId: t.hazard_point != null ? Number(t.hazard_point) : null,
    hazardPointName: String(t.hazard_point_name || ''),
    hazardPointCode: String(t.hazard_point_code || ''),
    status: (t.status as InspectionStatus) || 'pending',
    statusDisplay: String(t.status_display || t.status || ''),
    priority: (t.priority as InspectionPriority) || 'medium',
    priorityDisplay: String(t.priority_display || t.priority || ''),
    assignedTo: String(t.assigned_to || ''),
    assignedPhone: String(t.assigned_phone || ''),
    routeDesc: String(t.route_desc || ''),
    checkpointCount: Number(t.checkpoint_count || 0),
    plannedDate: t.planned_date ? String(t.planned_date) : '',
    startedAt: t.started_at ? String(t.started_at) : '',
    completedAt: t.completed_at ? String(t.completed_at) : '',
    result: String(t.result || ''),
    issueCount: Number(t.issue_count || 0),
    durationMinutes: Number(t.duration_minutes || 0),
    isOverdue: Boolean(t.is_overdue),
    createTime: String(t.created_at || ''),
    updateTime: String(t.updated_at || ''),
  };
}

export async function getInspectionTasks(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  priority?: string;
  taskType?: string;
  search?: string;
  overdue?: boolean;
  records?: boolean;
  dispatch?: boolean;
  unassigned?: boolean;
  hazardPoint?: number | string;
}): Promise<{ list: InspectionTask[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 10));
  if (params?.status) q.set('status', params.status);
  if (params?.priority) q.set('priority', params.priority);
  if (params?.taskType) q.set('task_type', params.taskType);
  if (params?.search) q.set('search', params.search);
  if (params?.overdue) q.set('overdue', '1');
  if (params?.records) q.set('records', '1');
  if (params?.dispatch) q.set('dispatch', '1');
  if (params?.unassigned) q.set('unassigned', '1');
  if (params?.hazardPoint) q.set('hazard_point', String(params.hazardPoint));
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/hazard/tasks/?${q.toString()}`
  );
  return { list: data.results.map(mapInspectionTask), total: data.count };
}

export async function getInspectionTask(id: string | number): Promise<InspectionTask> {
  const data = await apiFetch<Record<string, unknown>>(`/api/hazard/tasks/${id}/`);
  return mapInspectionTask(data);
}

export async function createInspectionTask(
  payload: InspectionTaskPayload
): Promise<InspectionTask> {
  const data = await apiFetch<Record<string, unknown>>('/api/hazard/tasks/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapInspectionTask(data);
}

export async function updateInspectionTask(
  id: string | number,
  payload: Partial<InspectionTaskPayload>
): Promise<InspectionTask> {
  const data = await apiFetch<Record<string, unknown>>(`/api/hazard/tasks/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapInspectionTask(data);
}

export async function deleteInspectionTask(id: string | number): Promise<void> {
  await apiFetch(`/api/hazard/tasks/${id}/`, { method: 'DELETE' });
}

export async function getInspectionNextCode(): Promise<string> {
  const data = await apiFetch<{ code: string }>('/api/hazard/tasks/next_code/');
  return data.code;
}

export async function getInspectionStats(): Promise<InspectionTaskStats> {
  return apiFetch<InspectionTaskStats>('/api/hazard/tasks/statistics/');
}

export async function dispatchInspectionTask(
  id: string | number,
  data: {
    assigned_to: string;
    assigned_phone?: string;
    planned_date?: string;
    route_desc?: string;
    checkpoint_count?: number;
  }
): Promise<InspectionTask> {
  const res = await apiFetch<Record<string, unknown>>(`/api/hazard/tasks/${id}/assign/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapInspectionTask(res);
}

export type InspectionDispatchStats = {
  open_total: number;
  unassigned: number;
  pending: number;
  in_progress: number;
  overdue: number;
  assigned_pending: number;
};

export type InspectionWorker = {
  id: number;
  username: string;
  name: string;
  phone: string;
  role: string;
  role_display: string;
  village: string;
};

export async function getInspectionDispatchStats(): Promise<InspectionDispatchStats> {
  return apiFetch<InspectionDispatchStats>('/api/hazard/tasks/dispatch_stats/');
}

export async function getInspectionWorkers(search?: string): Promise<InspectionWorker[]> {
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  const data = await apiFetch<{ results: InspectionWorker[] }>(
    `/api/hazard/tasks/workers/?${q.toString()}`
  );
  return data.results;
}

export async function createAndDispatchInspectionTask(
  payload: InspectionTaskPayload
): Promise<InspectionTask> {
  const data = await apiFetch<Record<string, unknown>>('/api/hazard/tasks/create_dispatch/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapInspectionTask(data);
}

export async function startInspectionTask(id: string | number): Promise<InspectionTask> {
  const res = await apiFetch<Record<string, unknown>>(`/api/hazard/tasks/${id}/start/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return mapInspectionTask(res);
}

export async function completeInspectionTask(
  id: string | number,
  data: {
    result: string;
    issue_count?: number;
    duration_minutes?: number;
    sync_hazard_status?: boolean;
  }
): Promise<InspectionTask & { hazard_status_updated?: { id: number; status: string } | null }> {
  const res = await apiFetch<Record<string, unknown>>(`/api/hazard/tasks/${id}/complete/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return {
    ...mapInspectionTask(res),
    hazard_status_updated: (res.hazard_status_updated as { id: number; status: string }) || null,
  };
}

export async function cancelInspectionTask(
  id: string | number,
  reason = ''
): Promise<InspectionTask> {
  const res = await apiFetch<Record<string, unknown>>(`/api/hazard/tasks/${id}/cancel/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return mapInspectionTask(res);
}

export async function exportInspectionTasks(params?: {
  status?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.search) q.set('search', params.search);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/hazard/tasks/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'inspection_tasks.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function getMonitoringDevices(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  deviceType?: string;
  search?: string;
  lowBattery?: boolean;
  stale?: boolean;
  unlinked?: boolean;
  hazardPoint?: number | string;
}): Promise<{ list: MonitoringDevice[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 100));
  if (params?.status) q.set('status', params.status);
  if (params?.deviceType) q.set('device_type', params.deviceType);
  if (params?.search) q.set('search', params.search);
  if (params?.lowBattery) q.set('low_battery', '1');
  if (params?.stale) q.set('stale', '1');
  if (params?.unlinked) q.set('unlinked', '1');
  if (params?.hazardPoint) q.set('hazard_point', String(params.hazardPoint));
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/monitoring/devices/?${q.toString()}`
  );
  return { list: data.results.map(mapDevice), total: data.count };
}

export async function getMonitoringDevice(id: string | number): Promise<MonitoringDevice> {
  const data = await apiFetch<Record<string, unknown>>(`/api/monitoring/devices/${id}/`);
  return mapDevice(data);
}

export async function createMonitoringDevice(payload: DevicePayload): Promise<MonitoringDevice> {
  const data = await apiFetch<Record<string, unknown>>('/api/monitoring/devices/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapDevice(data);
}

export async function updateMonitoringDevice(
  id: string | number,
  payload: Partial<DevicePayload>
): Promise<MonitoringDevice> {
  const data = await apiFetch<Record<string, unknown>>(`/api/monitoring/devices/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapDevice(data);
}

export async function deleteMonitoringDevice(id: string | number): Promise<void> {
  await apiFetch(`/api/monitoring/devices/${id}/`, { method: 'DELETE' });
}

export async function getDeviceNextCode(deviceType = 'others'): Promise<string> {
  const data = await apiFetch<{ code: string }>(
    `/api/monitoring/devices/next_code/?device_type=${deviceType}`
  );
  return data.code;
}

export async function getDeviceStats(): Promise<DeviceStats> {
  return apiFetch<DeviceStats>('/api/monitoring/devices/statistics/');
}

export async function getDeviceRelated(id: string | number): Promise<DeviceRelated> {
  return apiFetch<DeviceRelated>(`/api/monitoring/devices/${id}/related/`);
}

export async function changeDeviceStatus(
  id: string | number,
  status: MonitoringDevice['status']
): Promise<MonitoringDevice> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/monitoring/devices/${id}/change_status/`,
    { method: 'POST', body: JSON.stringify({ status }) }
  );
  return mapDevice(data);
}

export async function bindDeviceHazard(
  id: string | number,
  hazardPointId: number | null,
  syncCoords = true
): Promise<MonitoringDevice> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/monitoring/devices/${id}/bind_hazard/`,
    {
      method: 'POST',
      body: JSON.stringify({ hazard_point: hazardPointId, sync_coords: syncCoords }),
    }
  );
  return mapDevice(data);
}

export async function exportMonitoringDevices(params?: {
  status?: string;
  deviceType?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.deviceType) q.set('device_type', params.deviceType);
  if (params?.search) q.set('search', params.search);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/monitoring/devices/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'monitoring_devices.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function getDeviceTree(params?: {
  deviceType?: string;
  status?: string;
}): Promise<DeviceTree> {
  const q = new URLSearchParams();
  if (params?.deviceType) q.set('device_type', params.deviceType);
  if (params?.status) q.set('status', params.status);
  const data = await apiFetch<DeviceTree | Record<string, DeviceTreeNode[]>>(
    `/api/monitoring/devices/device_tree/?${q.toString()}`
  );
  // 兼容旧扁平结构
  if (data && typeof data === 'object' && !Array.isArray(data) && 'nodes' in data) {
    return data as DeviceTree;
  }
  const flat = data as Record<string, DeviceTreeNode[]>;
  const nodes = Object.entries(flat || {}).map(([name, devices]) => ({
    key: `legacy:${name}`,
    name,
    level: 'village',
    count: devices.length,
    online: devices.filter((d) => d.status === 'online').length,
    children: [] as DeviceTree['nodes'],
    devices,
  }));
  return {
    nodes,
    total: nodes.reduce((s, n) => s + n.count, 0),
    online: nodes.reduce((s, n) => s + n.online, 0),
    groups: flat,
  };
}

/** ---------- 实时监测数据 ---------- */

export async function getMonitorOverview(params?: {
  range?: MonitorTimeRange;
  deviceType?: string;
}): Promise<MonitorDataOverview> {
  const q = new URLSearchParams();
  q.set('range', params?.range ?? '24h');
  if (params?.deviceType) q.set('device_type', params.deviceType);
  return apiFetch<MonitorDataOverview>(`/api/monitoring/data/overview/?${q.toString()}`);
}

export async function getMonitorSeries(params: {
  deviceId: string | number;
  dataType?: MonitorDataType | string;
  range?: MonitorTimeRange;
  limit?: number;
}): Promise<MonitorSeries> {
  const q = new URLSearchParams();
  q.set('device_id', String(params.deviceId));
  q.set('range', params.range ?? '24h');
  if (params.dataType) q.set('data_type', params.dataType);
  if (params.limit) q.set('limit', String(params.limit));
  return apiFetch<MonitorSeries>(`/api/monitoring/data/series/?${q.toString()}`);
}

export async function getMonitorLatest(deviceId: string | number): Promise<MonitorLatest> {
  return apiFetch<MonitorLatest>(
    `/api/monitoring/data/latest/?device_id=${deviceId}`
  );
}

export async function ingestMonitorData(
  payload: MonitorIngestPayload
): Promise<MonitorIngestResult> {
  return apiFetch<MonitorIngestResult>('/api/monitoring/data/', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(payload),
  });
}

export async function exportMonitorData(params?: {
  deviceId?: string | number;
  dataType?: string;
  range?: MonitorTimeRange;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set('range', params?.range ?? '24h');
  if (params?.deviceId) q.set('device_id', String(params.deviceId));
  if (params?.dataType) q.set('data_type', params.dataType);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/monitoring/data/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'monitor_data.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function getEvacuationTasks(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  warning?: number;
  hazardPoint?: number;
}): Promise<{ list: EvacuationTask[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 100));
  if (params?.status) q.set('status', params.status);
  if (params?.search) q.set('search', params.search);
  if (params?.warning) q.set('warning', String(params.warning));
  if (params?.hazardPoint) q.set('hazard_point', String(params.hazardPoint));
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/emergency/evacuation/?${q.toString()}`
  );
  return { list: data.results.map(mapEvacuation), total: data.count };
}

export async function getEvacuationTask(id: number): Promise<EvacuationTask> {
  const data = await apiFetch<Record<string, unknown>>(`/api/emergency/evacuation/${id}/`);
  return mapEvacuation(data);
}

export async function getEvacuationStats(): Promise<EvacuationTaskStats> {
  return apiFetch<EvacuationTaskStats>('/api/emergency/evacuation/statistics/');
}

export async function getEvacuationNextCode(): Promise<string> {
  const data = await apiFetch<{ code: string }>('/api/emergency/evacuation/next_code/');
  return data.code;
}

export async function getEvacuationMapGeoJSON(params?: {
  status?: string;
}): Promise<EvacuationGeoJSON> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return apiFetch<EvacuationGeoJSON>(`/api/emergency/evacuation/map_geojson/${suffix}`);
}

export async function getEvacuationShelters(): Promise<{
  count: number;
  results: EvacuationShelter[];
}> {
  return apiFetch('/api/emergency/evacuation/shelters/');
}

export async function getEvacuationRelated(id: number): Promise<EvacuationRelated> {
  return apiFetch<EvacuationRelated>(`/api/emergency/evacuation/${id}/related/`);
}

export async function createEvacuationTask(
  payload: EvacuationTaskPayload
): Promise<EvacuationTask> {
  const data = await apiFetch<Record<string, unknown>>('/api/emergency/evacuation/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapEvacuation(data);
}

export async function updateEvacuationTask(
  id: number,
  payload: Partial<EvacuationTaskPayload>
): Promise<EvacuationTask> {
  const data = await apiFetch<Record<string, unknown>>(`/api/emergency/evacuation/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapEvacuation(data);
}

export async function deleteEvacuationTask(id: number): Promise<void> {
  await apiFetch(`/api/emergency/evacuation/${id}/`, { method: 'DELETE' });
}

export async function createEvacuationFromWarning(payload: {
  warning_id: number;
  shelter_name?: string;
  shelter_address?: string;
  shelter_longitude?: number;
  shelter_latitude?: number;
  total_people?: number;
  commander?: string;
  commander_phone?: string;
  grid_worker?: string;
  grid_phone?: string;
}): Promise<EvacuationTask> {
  const data = await apiFetch<Record<string, unknown>>(
    '/api/emergency/evacuation/from_warning/',
    { method: 'POST', body: JSON.stringify(payload) }
  );
  return mapEvacuation(data);
}

export async function startEvacuationTask(id: number): Promise<EvacuationTask> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/emergency/evacuation/${id}/start/`,
    { method: 'POST', body: '{}' }
  );
  return mapEvacuation(data);
}

export async function updateEvacuationProgress(
  id: number,
  transferredPeople: number
): Promise<EvacuationTask> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/emergency/evacuation/${id}/update_progress/`,
    {
      method: 'POST',
      body: JSON.stringify({ transferred_people: transferredPeople }),
    }
  );
  return mapEvacuation(data);
}

export async function completeEvacuationTask(id: number): Promise<EvacuationTask> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/emergency/evacuation/${id}/complete/`,
    { method: 'POST', body: '{}' }
  );
  return mapEvacuation(data);
}

export async function cancelEvacuationTask(id: number): Promise<EvacuationTask> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/emergency/evacuation/${id}/cancel/`,
    { method: 'POST', body: '{}' }
  );
  return mapEvacuation(data);
}

export async function exportEvacuationTasks(params?: {
  status?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.search) q.set('search', params.search);
  const res = await fetch(`/api/emergency/evacuation/export/?${q.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'evacuation_tasks.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function confirmWarning(
  dbId: number,
  confirmUser: string,
  note = ''
): Promise<WarningRecord> {
  const data = await apiFetch<Record<string, unknown>>(`/api/warning/records/${dbId}/confirm/`, {
    method: 'POST',
    body: JSON.stringify({ confirm_user: confirmUser, note }),
  });
  return mapWarning(data);
}

export async function analyzeWarning(
  dbId: number,
  payload?: { note?: string; conclusion?: string }
): Promise<WarningRecord> {
  const data = await apiFetch<Record<string, unknown>>(`/api/warning/records/${dbId}/analyze/`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
  return mapWarning(data);
}

export async function publishWarning(
  dbId: number,
  publishUser: string,
  note = ''
): Promise<WarningRecord> {
  const data = await apiFetch<Record<string, unknown>>(`/api/warning/records/${dbId}/publish/`, {
    method: 'POST',
    body: JSON.stringify({ publish_user: publishUser, note }),
  });
  return mapWarning(data);
}

export async function callWarning(
  dbId: number,
  caller: string,
  opts?: { targets?: string[]; channels?: Array<'sms' | 'voice'> }
): Promise<WarningRecord & { dispatch?: CallDispatchResult }> {
  const data = await apiFetch<Record<string, unknown>>(`/api/warning/records/${dbId}/call/`, {
    method: 'POST',
    body: JSON.stringify({
      caller,
      targets: opts?.targets,
      channels: opts?.channels,
    }),
  });
  const record = mapWarning(data);
  return {
    ...record,
    dispatch: data.dispatch as CallDispatchResult | undefined,
  };
}

export type CallDispatchResult = {
  ok: boolean;
  status: string;
  channels: string[];
  message: string;
  results: Array<{
    target: string;
    phone: string;
    channel: string;
    ok: boolean;
    detail: string;
    provider: string;
  }>;
};

export async function processWarning(dbId: number): Promise<WarningRecord> {
  const data = await apiFetch<Record<string, unknown>>(`/api/warning/records/${dbId}/process/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return mapWarning(data);
}

export async function closeWarning(dbId: number, closeReason: string): Promise<WarningRecord> {
  const data = await apiFetch<Record<string, unknown>>(`/api/warning/records/${dbId}/close/`, {
    method: 'POST',
    body: JSON.stringify({ close_reason: closeReason }),
  });
  return mapWarning(data);
}

export async function exportWarnings(params?: {
  statusGroup?: string;
  level?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.statusGroup) q.set('status_group', params.statusGroup);
  if (params?.level) q.set('level', params.level);
  if (params?.search) q.set('search', params.search);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/warning/records/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'warning_records.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** ---------- 预警模型配置 ---------- */

function mapWarningModel(m: Record<string, unknown>): WarningModelConfig {
  return {
    id: Number(m.id),
    code: String(m.code || ''),
    name: String(m.name || ''),
    modelType: (m.model_type as WarningModelType) || 'threshold',
    modelTypeDisplay: String(m.model_type_display || m.model_type || ''),
    description: String(m.description || ''),
    params: (m.params as Record<string, unknown>) || {},
    yellowThreshold: Number(m.yellow_threshold || 0),
    orangeThreshold: Number(m.orange_threshold || 0),
    redThreshold: Number(m.red_threshold || 0),
    thresholdSummary: String(m.threshold_summary || ''),
    accuracy: m.accuracy != null ? Number(m.accuracy) : null,
    isPrimary: Boolean(m.is_primary),
    isActive: Boolean(m.is_active),
    createdAt: String(m.created_at || ''),
    updatedAt: String(m.updated_at || ''),
  };
}

export async function getWarningModels(params?: {
  page?: number;
  pageSize?: number;
  modelType?: string;
  isActive?: boolean;
  search?: string;
}): Promise<{ list: WarningModelConfig[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 50));
  if (params?.modelType) q.set('model_type', params.modelType);
  if (params?.isActive === true) q.set('is_active', 'true');
  if (params?.isActive === false) q.set('is_active', 'false');
  if (params?.search) q.set('search', params.search);
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/warning/models/?${q.toString()}`
  );
  return { list: data.results.map(mapWarningModel), total: data.count };
}

export async function getWarningModel(id: number): Promise<WarningModelConfig> {
  const data = await apiFetch<Record<string, unknown>>(`/api/warning/models/${id}/`);
  return mapWarningModel(data);
}

export async function getWarningModelStats(): Promise<WarningModelStats> {
  return apiFetch<WarningModelStats>('/api/warning/models/statistics/');
}

export async function getWarningModelNextCode(modelType = 'threshold'): Promise<string> {
  const data = await apiFetch<{ code: string }>(
    `/api/warning/models/next_code/?model_type=${modelType}`
  );
  return data.code;
}

export async function createWarningModel(
  payload: WarningModelPayload
): Promise<WarningModelConfig> {
  const data = await apiFetch<Record<string, unknown>>('/api/warning/models/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapWarningModel(data);
}

export async function updateWarningModel(
  id: number,
  payload: Partial<WarningModelPayload>
): Promise<WarningModelConfig> {
  const data = await apiFetch<Record<string, unknown>>(`/api/warning/models/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapWarningModel(data);
}

export async function deleteWarningModel(id: number): Promise<void> {
  await apiFetch(`/api/warning/models/${id}/`, { method: 'DELETE' });
}

export async function activateWarningModel(
  id: number,
  exclusive = true
): Promise<WarningModelConfig> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/warning/models/${id}/activate/`,
    { method: 'POST', body: JSON.stringify({ exclusive }) }
  );
  return mapWarningModel(data);
}

export async function deactivateWarningModel(id: number): Promise<WarningModelConfig> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/warning/models/${id}/deactivate/`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return mapWarningModel(data);
}

export async function testWarningModel(
  id: number,
  dataType: string,
  value: number,
  opts?: { deviceId?: number; channel?: string }
): Promise<WarningModelTestResult> {
  return apiFetch<WarningModelTestResult>(`/api/warning/models/${id}/test/`, {
    method: 'POST',
    body: JSON.stringify({
      data_type: dataType,
      value,
      device_id: opts?.deviceId,
      channel: opts?.channel || '',
    }),
  });
}

/** 按真实路网重算转移路线 */
export async function rerouteEvacuationTask(id: number): Promise<EvacuationTask & { route_hint?: string }> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/emergency/evacuation/${id}/reroute/`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return { ...mapEvacuation(data), route_hint: data.route_hint ? String(data.route_hint) : undefined };
}

/** 闭环联调：独占启用 → 模拟上报 → 规则引擎建单 */
export async function loopDemoWarningModel(
  id: number,
  payload?: {
    device_code?: string;
    data_type?: string;
    value?: number;
    unit?: string;
    channel?: string;
  }
): Promise<{
  ok: boolean;
  message: string;
  model_code: string;
  trace_id: string;
  warning_id?: number | null;
  warning_code?: string | null;
  created?: boolean;
  renewed?: boolean;
  step: Record<string, unknown>;
  ingest?: Record<string, unknown>;
}> {
  return apiFetch(`/api/warning/models/${id}/loop_demo/`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function exportWarningModels(params?: {
  modelType?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.modelType) q.set('model_type', params.modelType);
  if (params?.search) q.set('search', params.search);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/warning/models/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'warning_models.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** ---------- 应急预案管理 ---------- */

function mapEmergencyPlan(p: Record<string, unknown>): EmergencyPlan {
  const content = (p.content as EmergencyPlan['content']) || {};
  const scenarios = Array.isArray(p.applicable_scenarios)
    ? (p.applicable_scenarios as string[])
    : [];
  return {
    id: Number(p.id),
    code: String(p.code || ''),
    name: String(p.name || ''),
    level: String(p.level || '3') as PlanResponseLevel,
    levelDisplay: String(p.level_display || ''),
    colorLevel: (p.color_level as PlanColorLevel) || 'yellow',
    status: (p.status as PlanStatus) || 'draft',
    statusDisplay: String(p.status_display || ''),
    description: String(p.description || ''),
    content,
    applicableScenarios: scenarios,
    targetScope: String(p.target_scope || scenarios.join('、')),
    stepCount: Number(p.step_count ?? (content.steps?.length || 0)),
    commander: String(p.commander || ''),
    commanderPhone: String(p.commander_phone || ''),
    createdAt: String(p.created_at || ''),
    updatedAt: String(p.updated_at || ''),
  };
}

export async function getEmergencyPlans(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  level?: string;
  colorLevel?: string;
  search?: string;
}): Promise<{ list: EmergencyPlan[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 50));
  if (params?.status) q.set('status', params.status);
  if (params?.level) q.set('level', params.level);
  if (params?.colorLevel) q.set('color_level', params.colorLevel);
  if (params?.search) q.set('search', params.search);
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/emergency/plans/?${q.toString()}`
  );
  return { list: data.results.map(mapEmergencyPlan), total: data.count };
}

export async function getEmergencyPlan(id: number): Promise<EmergencyPlan> {
  const data = await apiFetch<Record<string, unknown>>(`/api/emergency/plans/${id}/`);
  return mapEmergencyPlan(data);
}

export async function getEmergencyPlanStats(): Promise<EmergencyPlanStats> {
  return apiFetch<EmergencyPlanStats>('/api/emergency/plans/statistics/');
}

export async function getEmergencyPlanNextCode(): Promise<string> {
  const data = await apiFetch<{ code: string }>('/api/emergency/plans/next_code/');
  return data.code;
}

export async function createEmergencyPlan(
  payload: EmergencyPlanPayload
): Promise<EmergencyPlan> {
  const data = await apiFetch<Record<string, unknown>>('/api/emergency/plans/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapEmergencyPlan(data);
}

export async function updateEmergencyPlan(
  id: number,
  payload: Partial<EmergencyPlanPayload>
): Promise<EmergencyPlan> {
  const data = await apiFetch<Record<string, unknown>>(`/api/emergency/plans/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapEmergencyPlan(data);
}

export async function deleteEmergencyPlan(id: number): Promise<void> {
  await apiFetch(`/api/emergency/plans/${id}/`, { method: 'DELETE' });
}

export async function activateEmergencyPlan(id: number): Promise<EmergencyPlan> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/emergency/plans/${id}/activate/`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return mapEmergencyPlan(data);
}

export async function archiveEmergencyPlan(id: number): Promise<EmergencyPlan> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/emergency/plans/${id}/archive/`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return mapEmergencyPlan(data);
}

export async function reviseEmergencyPlan(id: number): Promise<EmergencyPlan> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/emergency/plans/${id}/revise/`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return mapEmergencyPlan(data);
}

export async function getEmergencyPlanRelated(id: number): Promise<EmergencyPlanRelated> {
  return apiFetch<EmergencyPlanRelated>(`/api/emergency/plans/${id}/related/`);
}

export async function matchEmergencyPlans(params: {
  warningId?: number;
  colorLevel?: string;
}): Promise<{
  color_level: string;
  response_level: string;
  warning: Record<string, unknown> | null;
  count: number;
  results: EmergencyPlan[];
}> {
  const q = new URLSearchParams();
  if (params.warningId) q.set('warning_id', String(params.warningId));
  if (params.colorLevel) q.set('color_level', params.colorLevel);
  const data = await apiFetch<{
    color_level: string;
    response_level: string;
    warning: Record<string, unknown> | null;
    count: number;
    results: Record<string, unknown>[];
  }>(`/api/emergency/plans/match/?${q.toString()}`);
  return {
    ...data,
    results: data.results.map(mapEmergencyPlan),
  };
}

export async function launchEmergencyPlan(
  id: number,
  warningId: number,
  createEvacuation = true
): Promise<PlanLaunchResult> {
  return apiFetch<PlanLaunchResult>(`/api/emergency/plans/${id}/launch/`, {
    method: 'POST',
    body: JSON.stringify({
      warning_id: warningId,
      create_evacuation: createEvacuation,
    }),
  });
}

export async function exportEmergencyPlans(params?: {
  status?: string;
  colorLevel?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.colorLevel) q.set('color_level', params.colorLevel);
  if (params?.search) q.set('search', params.search);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/emergency/plans/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'emergency_plans.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** ---------- 生态治理工程 ---------- */

function mapEcologyProject(p: Record<string, unknown>): EcologyProject {
  const milestones = Array.isArray(p.milestones)
    ? (p.milestones as EcologyProject['milestones'])
    : [];
  return {
    id: Number(p.id),
    code: String(p.code || ''),
    name: String(p.name || ''),
    projectType: (p.project_type as EcologyProjectType) || 'other',
    projectTypeDisplay: String(p.project_type_display || p.project_type || ''),
    status: (p.status as EcologyProjectStatus) || 'designing',
    statusDisplay: String(p.status_display || p.status || ''),
    hazardPointId: p.hazard_point != null ? Number(p.hazard_point) : null,
    hazardPointName: String(p.hazard_point_name || ''),
    location: String(p.location || ''),
    description: String(p.description || ''),
    budget: Number(p.budget || 0),
    budgetDisplay: String(p.budget_display || `¥${p.budget || 0}万`),
    progress: Number(p.progress || 0),
    plannedDays: Number(p.planned_days || 0),
    doneDays: Number(p.done_days || 0),
    currentMilestone: String(p.current_milestone || ''),
    milestones,
    designer: String(p.designer || ''),
    contractor: String(p.contractor || ''),
    manager: String(p.manager || ''),
    managerPhone: String(p.manager_phone || ''),
    designDate: p.design_date ? String(p.design_date) : undefined,
    approveDate: p.approve_date ? String(p.approve_date) : undefined,
    startDate: p.start_date ? String(p.start_date) : undefined,
    endDate: p.end_date ? String(p.end_date) : undefined,
    actualEndDate: p.actual_end_date ? String(p.actual_end_date) : undefined,
    progressLogCount:
      p.progress_log_count != null ? Number(p.progress_log_count) : undefined,
    assessmentCount:
      p.assessment_count != null ? Number(p.assessment_count) : undefined,
    createdAt: String(p.created_at || ''),
    updatedAt: String(p.updated_at || ''),
  };
}

function mapEcologyProgress(l: Record<string, unknown>): EcologyProgressLog {
  return {
    id: Number(l.id),
    projectId: Number(l.project),
    projectCode: String(l.project_code || ''),
    projectName: String(l.project_name || ''),
    projectStatus: String(l.project_status || ''),
    projectType: String(l.project_type || ''),
    plannedDays: Number(l.planned_days || 0),
    progress: Number(l.progress || 0),
    doneDays: Number(l.done_days || 0),
    milestone: String(l.milestone || ''),
    note: String(l.note || ''),
    reporter: String(l.reporter || ''),
    reportDate: String(l.report_date || ''),
    createdAt: String(l.created_at || ''),
  };
}

function mapEcologyAssessment(a: Record<string, unknown>): EcologyAssessment {
  return {
    id: Number(a.id),
    code: String(a.code || ''),
    projectId: Number(a.project),
    projectCode: String(a.project_code || ''),
    projectName: String(a.project_name || ''),
    projectStatus: String(a.project_status || ''),
    factor: String(a.factor || ''),
    beforeValue: String(a.before_value || '-'),
    afterValue: String(a.after_value || '-'),
    unit: String(a.unit || ''),
    effect: (a.effect as EcologyAssessment['effect']) || 'monitoring',
    effectDisplay: String(a.effect_display || a.effect || ''),
    conclusion: String(a.conclusion || ''),
    assessor: String(a.assessor || ''),
    assessDate: String(a.assess_date || ''),
    createdAt: String(a.created_at || ''),
  };
}

export async function getEcologyProjects(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  projectType?: string;
  search?: string;
}): Promise<{ list: EcologyProject[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 50));
  if (params?.status) q.set('status', params.status);
  if (params?.projectType) q.set('project_type', params.projectType);
  if (params?.search) q.set('search', params.search);
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/ecology/projects/?${q.toString()}`
  );
  return { list: data.results.map(mapEcologyProject), total: data.count };
}

export async function getEcologyProject(id: number): Promise<EcologyProject> {
  const data = await apiFetch<Record<string, unknown>>(`/api/ecology/projects/${id}/`);
  return mapEcologyProject(data);
}

export async function getEcologyProjectStats(): Promise<EcologyProjectStats> {
  return apiFetch<EcologyProjectStats>('/api/ecology/projects/statistics/');
}

export async function getEcologyProjectNextCode(): Promise<string> {
  const data = await apiFetch<{ code: string }>('/api/ecology/projects/next_code/');
  return data.code;
}

export async function getEcologyProjectRelated(
  id: number
): Promise<EcologyProjectRelated> {
  const data = await apiFetch<{
    project: Record<string, unknown>;
    progress_logs: Record<string, unknown>[];
    assessments: Record<string, unknown>[];
    can_assess: boolean;
  }>(`/api/ecology/projects/${id}/related/`);
  return {
    project: data.project,
    progress_logs: data.progress_logs.map(mapEcologyProgress),
    assessments: data.assessments.map(mapEcologyAssessment),
    can_assess: data.can_assess,
  };
}

export async function createEcologyProject(
  payload: EcologyProjectPayload
): Promise<EcologyProject> {
  const data = await apiFetch<Record<string, unknown>>('/api/ecology/projects/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapEcologyProject(data);
}

export async function updateEcologyProject(
  id: number,
  payload: Partial<EcologyProjectPayload>
): Promise<EcologyProject> {
  const data = await apiFetch<Record<string, unknown>>(`/api/ecology/projects/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapEcologyProject(data);
}

export async function deleteEcologyProject(id: number): Promise<void> {
  await apiFetch(`/api/ecology/projects/${id}/`, { method: 'DELETE' });
}

export async function approveEcologyProject(id: number): Promise<EcologyProject> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/ecology/projects/${id}/approve/`,
    { method: 'POST', body: '{}' }
  );
  return mapEcologyProject(data);
}

export async function startEcologyProject(id: number): Promise<EcologyProject> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/ecology/projects/${id}/start/`,
    { method: 'POST', body: '{}' }
  );
  return mapEcologyProject(data);
}

export async function completeEcologyProject(id: number): Promise<EcologyProject> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/ecology/projects/${id}/complete/`,
    { method: 'POST', body: '{}' }
  );
  return mapEcologyProject(data);
}

export async function archiveEcologyProject(id: number): Promise<EcologyProject> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/ecology/projects/${id}/archive/`,
    { method: 'POST', body: '{}' }
  );
  return mapEcologyProject(data);
}

export async function reportEcologyProgress(
  projectId: number,
  payload: Omit<EcologyProgressPayload, 'project'>
): Promise<{ log: EcologyProgressLog; project: EcologyProject }> {
  const data = await apiFetch<{
    log: Record<string, unknown>;
    project: Record<string, unknown>;
  }>(`/api/ecology/projects/${projectId}/report_progress/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    log: mapEcologyProgress(data.log),
    project: mapEcologyProject(data.project),
  };
}

export async function exportEcologyProjects(params?: {
  status?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.search) q.set('search', params.search);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/ecology/projects/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ecology_projects.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function getEcologyProgressBoard(params?: {
  status?: string;
  search?: string;
}): Promise<EcologyProgressBoardItem[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.search) q.set('search', params.search);
  const data = await apiFetch<{
    results: Array<{
      project: Record<string, unknown>;
      latest_log: Record<string, unknown> | null;
    }>;
  }>(`/api/ecology/progress/board/?${q.toString()}`);
  return data.results.map((r) => ({
    project: mapEcologyProject(r.project),
    latest_log: r.latest_log ? mapEcologyProgress(r.latest_log) : null,
  }));
}

export async function getEcologyProgressStats(): Promise<EcologyProgressStats> {
  return apiFetch<EcologyProgressStats>('/api/ecology/progress/statistics/');
}

export async function createEcologyProgress(
  payload: EcologyProgressPayload
): Promise<EcologyProgressLog> {
  const data = await apiFetch<Record<string, unknown>>('/api/ecology/progress/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapEcologyProgress(data);
}

export async function deleteEcologyProgress(id: number): Promise<void> {
  await apiFetch(`/api/ecology/progress/${id}/`, { method: 'DELETE' });
}

export async function getEcologyAssessments(params?: {
  page?: number;
  pageSize?: number;
  effect?: string;
  project?: number;
  search?: string;
}): Promise<{ list: EcologyAssessment[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 50));
  if (params?.effect) q.set('effect', params.effect);
  if (params?.project) q.set('project', String(params.project));
  if (params?.search) q.set('search', params.search);
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/ecology/assessments/?${q.toString()}`
  );
  return { list: data.results.map(mapEcologyAssessment), total: data.count };
}

export async function getEcologyAssessmentStats(): Promise<EcologyAssessmentStats> {
  return apiFetch<EcologyAssessmentStats>('/api/ecology/assessments/statistics/');
}

export async function getEcologyAssessmentNextCode(): Promise<string> {
  const data = await apiFetch<{ code: string }>('/api/ecology/assessments/next_code/');
  return data.code;
}

export async function createEcologyAssessment(
  payload: EcologyAssessmentPayload
): Promise<EcologyAssessment> {
  const data = await apiFetch<Record<string, unknown>>('/api/ecology/assessments/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapEcologyAssessment(data);
}

export async function updateEcologyAssessment(
  id: number,
  payload: Partial<EcologyAssessmentPayload>
): Promise<EcologyAssessment> {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/ecology/assessments/${id}/`,
    { method: 'PATCH', body: JSON.stringify(payload) }
  );
  return mapEcologyAssessment(data);
}

export async function concludeEcologyAssessment(
  id: number,
  payload: { effect?: string; conclusion?: string; after_value?: string }
): Promise<{ assessment: EcologyAssessment; project_ready_to_archive: boolean }> {
  const data = await apiFetch<{
    assessment: Record<string, unknown>;
    project_ready_to_archive: boolean;
  }>(`/api/ecology/assessments/${id}/conclude/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    assessment: mapEcologyAssessment(data.assessment),
    project_ready_to_archive: data.project_ready_to_archive,
  };
}

export async function deleteEcologyAssessment(id: number): Promise<void> {
  await apiFetch(`/api/ecology/assessments/${id}/`, { method: 'DELETE' });
}

export async function exportEcologyAssessments(params?: {
  effect?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.effect) q.set('effect', params.effect);
  if (params?.search) q.set('search', params.search);
  const token = typeof window !== 'undefined' ? localStorage.getItem('geohazard_access') : null;
  const res = await fetch(`/api/ecology/assessments/export/?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('导出失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ecology_assessments.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** ---------- Emergency supplies ---------- */
const SUPPLY_CATEGORY_LABELS: Record<string, string> = {
  food: '食品',
  water: '饮用水',
  tent: '帐篷',
  medical: '医疗用品',
  tool: '工具设备',
  other: '其他',
};

function mapEmergencySupply(s: Record<string, unknown>): EmergencySupply {
  const quantity = Number(s.quantity || 0);
  return {
    id: Number(s.id),
    code: String(s.code || ''),
    name: String(s.name || ''),
    category: s.category as EmergencySupply['category'],
    categoryDisplay: String(
      s.category_display || SUPPLY_CATEGORY_LABELS[String(s.category)] || s.category || ''
    ),
    quantity,
    unit: String(s.unit || '件'),
    storageLocation: String(s.storage_location || ''),
    responsiblePerson: String(s.responsible_person || ''),
    contactPhone: String(s.contact_phone || ''),
    lastCheckDate: s.last_check_date ? String(s.last_check_date) : undefined,
    stockStatus: quantity < 50 ? '偏低' : '充足',
    createdAt: String(s.created_at || ''),
    updatedAt: String(s.updated_at || ''),
  };
}

export async function getEmergencySupplies(params?: {
  page?: number;
  pageSize?: number;
  category?: string;
  search?: string;
}): Promise<{ list: EmergencySupply[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 50));
  if (params?.category) q.set('category', params.category);
  if (params?.search) q.set('search', params.search);
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/emergency/supplies/?${q.toString()}`
  );
  return { list: data.results.map(mapEmergencySupply), total: data.count };
}

export async function getEmergencySupplyStats(): Promise<EmergencySupplyStats> {
  return apiFetch<EmergencySupplyStats>('/api/emergency/supplies/statistics/');
}

export async function getEmergencySupplyNextCode(): Promise<string> {
  const data = await apiFetch<{ code: string }>('/api/emergency/supplies/next_code/');
  return data.code;
}

export async function createEmergencySupply(
  payload: EmergencySupplyPayload
): Promise<EmergencySupply> {
  const data = await apiFetch<Record<string, unknown>>('/api/emergency/supplies/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapEmergencySupply(data);
}

export async function updateEmergencySupply(
  id: number,
  payload: Partial<EmergencySupplyPayload>
): Promise<EmergencySupply> {
  const data = await apiFetch<Record<string, unknown>>(`/api/emergency/supplies/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapEmergencySupply(data);
}

export async function deleteEmergencySupply(id: number): Promise<void> {
  await apiFetch(`/api/emergency/supplies/${id}/`, { method: 'DELETE' });
}

/** ---------- System users ---------- */
const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员',
  leader: '值班领导',
  operator: '值班员',
  grid_worker: '网格员',
  viewer: '查看者',
};

function mapSystemUser(u: Record<string, unknown>): SystemUser {
  const firstName = String(u.first_name || '');
  const lastName = String(u.last_name || '');
  const username = String(u.username || '');
  return {
    id: Number(u.id),
    username,
    firstName,
    lastName,
    displayName: firstName || lastName ? `${firstName}${lastName}`.trim() : username,
    phone: String(u.phone || ''),
    role: String(u.role || 'viewer'),
    roleDisplay: String(u.role_display || ROLE_LABELS[String(u.role)] || u.role || ''),
    department: String(u.department || ''),
    village: String(u.village || ''),
    isActive: u.is_active !== false && u.is_active !== 'false' && u.is_active !== 0,
    dateJoined: String(u.date_joined || ''),
  };
}

export async function getSystemUsers(params?: {
  page?: number;
  pageSize?: number;
  role?: string;
  isActive?: boolean;
  search?: string;
}): Promise<{ list: SystemUser[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 50));
  if (params?.role) q.set('role', params.role);
  if (params?.isActive != null) q.set('is_active', params.isActive ? 'true' : 'false');
  if (params?.search) q.set('search', params.search);
  const data = await apiFetch<
    Paginated<Record<string, unknown>> | Record<string, unknown>[]
  >(`/api/users/?${q.toString()}`);
  if (Array.isArray(data)) {
    return { list: data.map(mapSystemUser), total: data.length };
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  return { list: results.map(mapSystemUser), total: Number(data?.count ?? results.length) };
}

export async function createSystemUser(payload: SystemUserPayload): Promise<SystemUser> {
  const data = await apiFetch<Record<string, unknown>>('/api/users/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapSystemUser(data);
}

export async function updateSystemUser(
  id: number,
  payload: Partial<SystemUserPayload>
): Promise<SystemUser> {
  const data = await apiFetch<Record<string, unknown>>(`/api/users/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapSystemUser(data);
}

export async function deleteSystemUser(id: number): Promise<void> {
  await apiFetch(`/api/users/${id}/`, { method: 'DELETE' });
}
