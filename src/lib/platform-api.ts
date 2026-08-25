import { apiFetch, type Paginated } from '@/lib/api-client';

export type MaterialStock = {
  id: number;
  code: string;
  name: string;
  spec: string;
  stock: number;
  unit: string;
  location: string;
  min_stock: number;
  status: 'adequate' | 'low' | 'short';
  status_display: string;
  remark: string;
};

export type EquipmentAsset = {
  id: number;
  code: string;
  name: string;
  model: string;
  location: string;
  last_maint: string | null;
  next_maint: string | null;
  status: 'normal' | 'maintain' | 'fault' | 'retired';
  status_display: string;
  keeper: string;
  remark: string;
};

export type CrossSectionLayer = { key: string; label: string; color: string };
export type CrossSectionPoint = { x: number; y: number; layer?: string };

export type CrossSection = {
  id: number;
  code: string;
  name: string;
  location: string;
  direction: string;
  length_m: number;
  hazard_point: number | null;
  hazard_point_name: string;
  profile_points: CrossSectionPoint[];
  layers: CrossSectionLayer[];
  description: string;
};

export type SystemConfig = {
  system_name: string;
  force_threshold: string;
  call_timeout_sec: number;
  notify_sms: boolean;
  notify_call: boolean;
  notify_app: boolean;
  notify_email: boolean;
  weather_text: string;
  weather_temp_c: number;
  weather_icon: string;
  extra?: Record<string, unknown>;
  updated_at?: string;
};

export type WeatherInfo = {
  text: string;
  temp_c: number;
  icon: string;
  provider?: string;
  wind_kmh?: number;
  humidity?: number;
  cached?: boolean;
  error?: string;
  updated_at?: string;
};

export type ChannelStatus = {
  ready: boolean;
  mode: string;
  hint: string;
  mapbox?: boolean;
  osrm_base?: string;
};

export type ChannelsStatus = {
  sms: ChannelStatus;
  voice: ChannelStatus;
  email: ChannelStatus;
  app: ChannelStatus;
  route: ChannelStatus;
  weather: ChannelStatus;
};

export type GeologySite = {
  id: number;
  code: string;
  name: string;
  hazard_point: number | null;
  hazard_point_name: string;
  longitude: number | null;
  latitude: number | null;
  height: number;
  tileset_url: string;
  ion_asset_id: string;
  glb_url: string;
  cover_url: string;
  status: string;
  status_display: string;
  description: string;
  viewer_path: string;
};

export type SearchHit = {
  type: string;
  type_label: string;
  id: number;
  title: string;
  subtitle: string;
  href: string;
};

export type AppNotification = {
  id: number;
  title: string;
  body: string;
  level: string;
  level_display: string;
  link: string;
  is_read: boolean;
  source: string;
  created_at: string;
};

function mapMaterial(r: Record<string, unknown>): MaterialStock {
  return {
    id: Number(r.id),
    code: String(r.code || ''),
    name: String(r.name || ''),
    spec: String(r.spec || ''),
    stock: Number(r.stock ?? 0),
    unit: String(r.unit || ''),
    location: String(r.location || ''),
    min_stock: Number(r.min_stock ?? 0),
    status: (r.status as MaterialStock['status']) || 'adequate',
    status_display: String(r.status_display || ''),
    remark: String(r.remark || ''),
  };
}

function mapAsset(r: Record<string, unknown>): EquipmentAsset {
  return {
    id: Number(r.id),
    code: String(r.code || ''),
    name: String(r.name || ''),
    model: String(r.model || ''),
    location: String(r.location || ''),
    last_maint: (r.last_maint as string) || null,
    next_maint: (r.next_maint as string) || null,
    status: (r.status as EquipmentAsset['status']) || 'normal',
    status_display: String(r.status_display || ''),
    keeper: String(r.keeper || ''),
    remark: String(r.remark || ''),
  };
}

function mapSection(r: Record<string, unknown>): CrossSection {
  return {
    id: Number(r.id),
    code: String(r.code || ''),
    name: String(r.name || ''),
    location: String(r.location || ''),
    direction: String(r.direction || ''),
    length_m: Number(r.length_m ?? 0),
    hazard_point: r.hazard_point == null ? null : Number(r.hazard_point),
    hazard_point_name: String(r.hazard_point_name || ''),
    profile_points: Array.isArray(r.profile_points)
      ? (r.profile_points as CrossSectionPoint[])
      : [],
    layers: Array.isArray(r.layers) ? (r.layers as CrossSectionLayer[]) : [],
    description: String(r.description || ''),
  };
}

export async function getMaterials(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}): Promise<{ list: MaterialStock[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 50));
  if (params?.search) q.set('search', params.search);
  if (params?.status) q.set('status', params.status);
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/equipment/materials/?${q}`
  );
  const results = data.results || [];
  return { list: results.map(mapMaterial), total: Number(data.count ?? results.length) };
}

export async function createMaterial(payload: Partial<MaterialStock>) {
  const data = await apiFetch<Record<string, unknown>>('/api/equipment/materials/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapMaterial(data);
}

export async function updateMaterial(id: number, payload: Partial<MaterialStock>) {
  const data = await apiFetch<Record<string, unknown>>(`/api/equipment/materials/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapMaterial(data);
}

export async function deleteMaterial(id: number) {
  await apiFetch(`/api/equipment/materials/${id}/`, { method: 'DELETE' });
}

export async function getMaterialStats() {
  return apiFetch<{ total: number; adequate: number; low: number; short: number }>(
    '/api/equipment/materials/statistics/'
  );
}

export async function getEquipmentAssets(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}): Promise<{ list: EquipmentAsset[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page', String(params?.page ?? 1));
  q.set('page_size', String(params?.pageSize ?? 50));
  if (params?.search) q.set('search', params.search);
  if (params?.status) q.set('status', params.status);
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/equipment/assets/?${q}`
  );
  const results = data.results || [];
  return { list: results.map(mapAsset), total: Number(data.count ?? results.length) };
}

export async function createEquipmentAsset(payload: Partial<EquipmentAsset>) {
  const data = await apiFetch<Record<string, unknown>>('/api/equipment/assets/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapAsset(data);
}

export async function updateEquipmentAsset(id: number, payload: Partial<EquipmentAsset>) {
  const data = await apiFetch<Record<string, unknown>>(`/api/equipment/assets/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapAsset(data);
}

export async function deleteEquipmentAsset(id: number) {
  await apiFetch(`/api/equipment/assets/${id}/`, { method: 'DELETE' });
}

export async function markEquipmentMaintained(id: number, nextDays = 90) {
  const data = await apiFetch<Record<string, unknown>>(
    `/api/equipment/assets/${id}/mark_maintained/`,
    { method: 'POST', body: JSON.stringify({ next_days: nextDays }) }
  );
  return mapAsset(data);
}

export async function getEquipmentStats() {
  return apiFetch<{
    total: number;
    normal: number;
    maintain: number;
    fault: number;
    retired: number;
    overdue: number;
  }>('/api/equipment/assets/statistics/');
}

export async function getCrossSections(params?: {
  search?: string;
}): Promise<{ list: CrossSection[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page_size', '100');
  if (params?.search) q.set('search', params.search);
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/geology/cross-sections/?${q}`
  );
  const results = data.results || [];
  return { list: results.map(mapSection), total: Number(data.count ?? results.length) };
}

export async function getCrossSection(id: number) {
  const data = await apiFetch<Record<string, unknown>>(`/api/geology/cross-sections/${id}/`);
  return mapSection(data);
}

export async function getSystemConfig() {
  return apiFetch<SystemConfig>('/api/platform/config/');
}

export async function saveSystemConfig(payload: Partial<SystemConfig>) {
  return apiFetch<SystemConfig>('/api/platform/config/', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getWeather(refresh = false) {
  const q = refresh ? '?refresh=1' : '';
  return apiFetch<WeatherInfo>(`/api/platform/weather/${q}`);
}

export async function getChannelsStatus() {
  return apiFetch<ChannelsStatus>('/api/platform/channels/');
}

function mapSite(r: Record<string, unknown>): GeologySite {
  return {
    id: Number(r.id),
    code: String(r.code || ''),
    name: String(r.name || ''),
    hazard_point: r.hazard_point == null ? null : Number(r.hazard_point),
    hazard_point_name: String(r.hazard_point_name || ''),
    longitude: r.longitude == null ? null : Number(r.longitude),
    latitude: r.latitude == null ? null : Number(r.latitude),
    height: Number(r.height ?? 2500),
    tileset_url: String(r.tileset_url || ''),
    ion_asset_id: String(r.ion_asset_id || ''),
    glb_url: String(r.glb_url || ''),
    cover_url: String(r.cover_url || ''),
    status: String(r.status || ''),
    status_display: String(r.status_display || ''),
    description: String(r.description || ''),
    viewer_path: String(r.viewer_path || ''),
  };
}

export async function getGeologySites(params?: {
  search?: string;
  published?: boolean;
}): Promise<{ list: GeologySite[]; total: number }> {
  const q = new URLSearchParams();
  q.set('page_size', '100');
  if (params?.search) q.set('search', params.search);
  if (params?.published) q.set('published', '1');
  const data = await apiFetch<Paginated<Record<string, unknown>>>(
    `/api/geology/sites/?${q}`
  );
  const results = data.results || [];
  return { list: results.map(mapSite), total: Number(data.count ?? results.length) };
}

export async function getGeologySite(id: number) {
  const data = await apiFetch<Record<string, unknown>>(`/api/geology/sites/${id}/`);
  return mapSite(data);
}

export async function createGeologySite(payload: Partial<GeologySite>) {
  const data = await apiFetch<Record<string, unknown>>('/api/geology/sites/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapSite(data);
}

export async function updateGeologySite(id: number, payload: Partial<GeologySite>) {
  const data = await apiFetch<Record<string, unknown>>(`/api/geology/sites/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapSite(data);
}

export async function deleteGeologySite(id: number) {
  await apiFetch(`/api/geology/sites/${id}/`, { method: 'DELETE' });
}

export async function getGeologySiteStats() {
  return apiFetch<{
    total: number;
    published: number;
    with_tileset: number;
    with_ion: number;
  }>('/api/geology/sites/statistics/');
}

export async function globalSearch(q: string) {
  const data = await apiFetch<{ q: string; count: number; results: SearchHit[] }>(
    `/api/platform/search/?q=${encodeURIComponent(q)}`
  );
  return data.results || [];
}

export async function getNotifications(params?: { unreadOnly?: boolean }) {
  const q = new URLSearchParams();
  q.set('page_size', '30');
  if (params?.unreadOnly) q.set('is_read', 'false');
  const data = await apiFetch<Paginated<AppNotification>>(
    `/api/platform/notifications/?${q}`
  );
  return {
    list: data.results || [],
    total: Number(data.count ?? 0),
    unread: (data.results || []).filter((n) => !n.is_read).length,
  };
}

export async function markNotificationRead(id: number) {
  return apiFetch<AppNotification>(`/api/platform/notifications/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ is_read: true }),
  });
}

export async function markAllNotificationsRead() {
  return apiFetch<{ updated: number }>('/api/platform/notifications/mark-all-read/', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
