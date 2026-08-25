export interface HazardPoint {
  id: string;
  code: string;
  name: string;
  type: 'landslide' | 'collapse' | 'debris_flow' | 'others';
  level: 'red' | 'orange' | 'yellow' | 'blue';
  status: 'stable' | 'attention' | 'warning' | 'emergency';
  location: {
    lng: number;
    lat: number;
    address: string;
    city: string;
    district: string;
    village: string;
    town: string;
    county: string;
  };
  scale: {
    volume: number;
    length: number;
    width: number;
    height: number;
  };
  threat: {
    people: number;
    houses: number;
    roads: number;
    assets: number;
  };
  coefficient: number;
  createTime: string;
  updateTime: string;
  responsiblePerson: string;
  contactPhone: string;
  photos: string[];
  files: string[];
  deviceCount?: number;
  openWarningCount?: number;
  inspectionPendingCount?: number;
}

export type HazardPointPayload = {
  code?: string;
  name: string;
  type: HazardPoint['type'];
  level: HazardPoint['level'];
  status?: HazardPoint['status'];
  longitude: number;
  latitude: number;
  address?: string;
  city?: string;
  district?: string;
  village?: string;
  town?: string;
  county?: string;
  volume?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  threat_people?: number;
  threat_houses?: number;
  threat_roads?: number;
  threat_assets?: number;
  stability_coefficient?: number;
  responsible_person?: string;
  contact_phone?: string;
};

/** @deprecated 旧三级结构，请用 RegionTreeNode */
export type HazardRegionNode = {
  name: string;
  children: Array<{ name: string; children: string[] }>;
};

export type RegionLevel = 'city' | 'district' | 'county' | 'village';

export type RegionTreeNode = {
  id: number;
  name: string;
  level: RegionLevel;
  level_display: string;
  parent_id: number | null;
  child_level: RegionLevel | null;
  child_level_display: string;
  /** 允许的下级类型（区下可为县或村） */
  child_levels?: RegionLevel[];
  child_level_options?: Array<{ level: RegionLevel; level_display: string }>;
  children: RegionTreeNode[];
};

export type HazardRelated = {
  devices: Array<{
    id: number;
    code: string;
    name: string;
    device_type: string;
    status: string;
    last_data_time: string | null;
  }>;
  warnings: Array<{
    id: number;
    code: string;
    level: string;
    status: string;
    trigger_type: string;
    created_at: string;
  }>;
  inspection_tasks: Array<{
    id: number;
    title: string;
    status: string;
    priority: string;
    assigned_to: string;
    planned_date: string | null;
  }>;
};

export type RiskLevel = 'high' | 'medium' | 'low';
export type MonitorCoverage = 'unlinked' | 'pending' | 'partial' | 'full' | 'offline';

export interface RiskSlope {
  id: string;
  code: string;
  name: string;
  hazardPointId: number | null;
  hazardPointName: string;
  hazardPointCode: string;
  riskLevel: RiskLevel;
  riskLevelDisplay: string;
  area: number;
  slopeAngle: number;
  description: string;
  longitude: number;
  latitude: number;
  monitorCoverage: MonitorCoverage;
  monitorCoverageDisplay: string;
  deviceCount?: number;
  openWarningCount?: number;
  createTime: string;
  updateTime: string;
}

export type RiskSlopePayload = {
  code?: string;
  name: string;
  hazard_point?: number | null;
  risk_level: RiskLevel;
  area: number;
  slope_angle?: number;
  description?: string;
  longitude?: number;
  latitude?: number;
};

export type RiskSlopeRelated = {
  hazard_point: {
    id: number;
    code: string;
    name: string;
    level: string;
    status: string;
  } | null;
  devices: HazardRelated['devices'];
  warnings: HazardRelated['warnings'];
  monitor_coverage?: MonitorCoverage;
  message?: string;
};

export type RiskSlopeStats = {
  total: number;
  by_level: { high: number; medium: number; low: number };
  by_coverage: Record<string, number>;
  linked: number;
  unlinked: number;
  total_area: number;
};

export type InspectionStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type InspectionPriority = 'high' | 'medium' | 'low';
export type InspectionTaskType = 'routine' | 'special' | 'emergency' | 'periodic';

export interface InspectionTask {
  id: string;
  code: string;
  title: string;
  description: string;
  taskType: InspectionTaskType;
  taskTypeDisplay: string;
  hazardPointId: number | null;
  hazardPointName: string;
  hazardPointCode: string;
  status: InspectionStatus;
  statusDisplay: string;
  priority: InspectionPriority;
  priorityDisplay: string;
  assignedTo: string;
  assignedPhone: string;
  routeDesc: string;
  checkpointCount: number;
  plannedDate: string;
  startedAt: string;
  completedAt: string;
  result: string;
  issueCount: number;
  durationMinutes: number;
  isOverdue: boolean;
  createTime: string;
  updateTime: string;
}

export type InspectionTaskPayload = {
  code?: string;
  title: string;
  description?: string;
  task_type?: InspectionTaskType;
  hazard_point?: number | null;
  status?: InspectionStatus;
  priority?: InspectionPriority;
  assigned_to?: string;
  assigned_phone?: string;
  route_desc?: string;
  checkpoint_count?: number;
  planned_date?: string | null;
};

export type InspectionTaskStats = {
  total: number;
  by_status: Record<InspectionStatus, number>;
  by_type: Record<string, number>;
  overdue: number;
  high_priority_open: number;
  issue_total: number;
};

export interface MonitoringDevice {
  id: string;
  dbId?: number;
  code: string;
  name: string;
  type: DeviceType;
  typeDisplay?: string;
  status: 'online' | 'offline' | 'fault';
  statusDisplay?: string;
  location: {
    lng: number;
    lat: number;
    address: string;
    city?: string;
    district?: string;
    county?: string;
    village?: string;
    town?: string;
  };
  hazardPointId?: number | null;
  hazardPointName?: string;
  hazardPointCode?: string;
  installDate: string;
  specs: {
    range: string;
    accuracy: string;
    power: number;
  };
  battery: number;
  signal: 'strong' | 'medium' | 'weak';
  signalDisplay?: string;
  lastDataTime: string;
  isStale?: boolean;
  lowBattery?: boolean;
  dataCount?: number;
  data: MonitorDataPoint[];
}

export type DeviceType =
  | 'npr_anchor'
  | 'rainfall'
  | 'fiber_optic'
  | 'camera'
  | 'gnss'
  | 'inclinometer'
  | 'others';

export type DevicePayload = {
  code?: string;
  name: string;
  device_type: DeviceType;
  status?: 'online' | 'offline' | 'fault';
  longitude?: number;
  latitude?: number;
  address?: string;
  city?: string;
  district?: string;
  county?: string;
  village?: string;
  town?: string;
  hazard_point?: number | null;
  install_date?: string | null;
  range_value?: string;
  accuracy?: string;
  power_consumption?: number;
  battery?: number;
  signal?: 'strong' | 'medium' | 'weak';
};

export type DeviceStats = {
  total: number;
  online: number;
  offline: number;
  fault: number;
  low_battery: number;
  stale: number;
  unlinked: number;
  by_type: Record<string, number>;
};

export type DeviceRelated = {
  device: Record<string, unknown>;
  latest_data: Array<{
    id: number;
    data_type: string;
    value: string | number;
    unit: string;
    record_time: string;
  }>;
  hazard_point: {
    id: number;
    code: string;
    name: string;
    level: string;
    status: string;
  } | null;
  open_warnings: Array<{
    id: number;
    code: string;
    level: string;
    status: string;
    trigger_type: string;
    created_at: string;
  }>;
};

export type MonitorDataType =
  | 'force'
  | 'displacement'
  | 'rainfall'
  | 'stress'
  | 'strain'
  | 'temperature';

export interface MonitorDataPoint {
  id?: number;
  time: string;
  value: number;
  type: MonitorDataType;
  unit: string;
  threshold?: {
    yellow: number;
    orange: number;
    red: number;
  };
}

export type MonitorTimeRange = '1h' | '24h' | '7d' | '30d';

export type MonitorDataOverview = {
  range: string;
  start_time: string;
  end_time: string;
  points: number;
  active_devices: number;
  online_devices: number;
  over_threshold: number;
  open_warnings: number;
  by_type: Record<string, number>;
};

export type MonitorSeries = {
  device: Record<string, unknown>;
  data_type: MonitorDataType;
  data_type_display: string;
  unit: string;
  range: string;
  start_time: string;
  end_time: string;
  thresholds: { yellow: number; orange: number; red: number };
  points: Array<{ id: number; time: string; value: number; unit: string }>;
  stats: {
    count: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    latest: number | null;
    over_yellow: number;
    over_orange: number;
    over_red: number;
  };
  available_types: MonitorDataType[];
  hazard_point: {
    id: number;
    code: string;
    name: string;
    level: string;
    status: string;
  } | null;
  open_warnings: Array<{
    id: number;
    code: string;
    level: string;
    status: string;
    trigger_type: string;
    created_at: string;
  }>;
  scale_max: number;
};

export type MonitorLatestParam = {
  data_type: MonitorDataType;
  data_type_display: string;
  value: number;
  unit: string;
  record_time: string;
  level: 'normal' | 'yellow' | 'orange' | 'red';
  thresholds: { yellow: number; orange: number; red: number };
  scale_max: number;
};

export type MonitorLatest = {
  device_id: number;
  device_code: string;
  params: MonitorLatestParam[];
};

export type DeviceTreeNode = {
  id: number;
  code: string;
  name: string;
  type: string;
  status: string;
  city?: string;
  district?: string;
  county?: string;
  village?: string;
  address?: string;
};

/** 旧版扁平分组 */
export type DeviceTreeFlat = Record<string, DeviceTreeNode[]>;

export type DeviceTreeGroup = {
  key: string;
  name: string;
  level: 'city' | 'district' | 'county' | 'village' | 'unassigned' | string;
  count: number;
  online: number;
  children: DeviceTreeGroup[];
  devices: DeviceTreeNode[];
};

export type DeviceTree = {
  nodes: DeviceTreeGroup[];
  total: number;
  online: number;
  /** 兼容旧结构 */
  groups?: DeviceTreeFlat;
};

export type MonitorIngestPayload = {
  device: number;
  data_type: MonitorDataType;
  value: number;
  unit?: string;
  record_time?: string;
};

export type MonitorIngestResult = {
  id: number;
  device: number;
  data_type: string;
  value: string | number;
  unit: string;
  record_time: string;
  warning?: {
    triggered: boolean;
    reason?: string;
    level?: string;
    warning_code?: string;
    warning_id?: number;
    deduplicated?: boolean;
    error?: string;
  };
};

export interface WarningRecord {
  id: string;
  dbId: number;
  hazardPointId: string;
  hazardPointDbId?: number;
  hazardPointName: string;
  level: 'red' | 'orange' | 'yellow' | 'blue';
  levelDisplay?: string;
  triggerType: string;
  triggerValue: Record<string, unknown>;
  confidence: number;
  status: 'pending' | 'confirmed' | 'analyzing' | 'published' | 'processing' | 'closed';
  statusDisplay?: string;
  confirmTime?: string;
  confirmUser?: string;
  publishTime?: string;
  publishUser?: string;
  closeTime?: string;
  closeReason?: string;
  callStatus?: 'success' | 'failed' | 'timeout' | 'pending' | string;
  callDetail?: Record<string, unknown>;
  createTime: string;
  updateTime: string;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  time: string;
  event: string;
  actor?: string;
  status: 'completed' | 'pending' | 'current';
}

export type WarningStats = {
  total: number;
  open: number;
  pending: number;
  processing: number;
  closed: number;
  by_level: Record<'red' | 'orange' | 'yellow' | 'blue', number>;
  open_by_level: Record<'red' | 'orange' | 'yellow' | 'blue', number>;
  filtered_total?: number;
};

export type WarningModelType = 'threshold' | 'trend' | 'ml' | 'fusion';

export interface WarningModelConfig {
  id: number;
  code: string;
  name: string;
  modelType: WarningModelType;
  modelTypeDisplay?: string;
  description: string;
  params: Record<string, unknown>;
  yellowThreshold: number;
  orangeThreshold: number;
  redThreshold: number;
  thresholdSummary?: string;
  accuracy?: number | null;
  isPrimary?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WarningModelPayload = {
  code?: string;
  name: string;
  model_type: WarningModelType;
  description?: string;
  params?: Record<string, unknown>;
  yellow_threshold: number;
  orange_threshold: number;
  red_threshold: number;
  is_active?: boolean;
};

export type WarningModelStats = {
  total: number;
  active: number;
  inactive: number;
  by_type: Record<string, number>;
  primary_threshold_id: number | null;
};

export type WarningModelTestResult = {
  model_id: number;
  model_code: string;
  model_type?: string;
  data_type?: string;
  value?: number;
  thresholds?: { yellow: number; orange: number; red: number };
  level?: 'red' | 'orange' | 'yellow' | 'blue' | null;
  triggered: boolean;
  message?: string;
  reason?: string;
  engine?: string;
  engine_primary?: boolean;
  confidence?: number;
  slope?: number;
  delta?: number;
  z_score?: number;
  sample_size?: number;
  score?: number;
  parts?: unknown[];
};

export type WarningRelated = {
  warning: Record<string, unknown>;
  hazard_point: {
    id: number;
    code: string;
    name: string;
    level: string;
    status: string;
    address: string;
    town: string;
    village: string;
    threat_people: number;
    threat_houses: number;
    responsible_person: string;
    contact_phone: string;
  };
  devices: Array<{
    id: number;
    code: string;
    name: string;
    device_type: string;
    status: string;
    battery: number;
    last_data_time?: string;
  }>;
  latest_data: Array<{
    device_id: number;
    data_type: string;
    value: string | number;
    unit: string;
    record_time: string;
  }>;
  evacuations: Array<{
    id: number;
    code: string;
    status: string;
    total_people: number;
    transferred_people: number;
    shelter_name?: string;
    commander?: string;
    grid_worker?: string;
    grid_phone?: string;
    commander_phone?: string;
  }>;
};

/** 预案响应等级：1红 2橙 3黄 4蓝 */
export type PlanResponseLevel = '1' | '2' | '3' | '4';
export type PlanStatus = 'draft' | 'active' | 'archived';
export type PlanColorLevel = 'red' | 'orange' | 'yellow' | 'blue';

export type PlanStep = {
  order: number;
  title: string;
  desc?: string;
};

export interface EmergencyPlan {
  id: number;
  code: string;
  name: string;
  level: PlanResponseLevel;
  levelDisplay?: string;
  colorLevel: PlanColorLevel;
  status: PlanStatus;
  statusDisplay?: string;
  description: string;
  content: {
    steps?: PlanStep[];
    resources?: string[];
    default_shelter?: string;
    [key: string]: unknown;
  };
  applicableScenarios: string[];
  targetScope: string;
  stepCount: number;
  commander: string;
  commanderPhone: string;
  createdAt: string;
  updatedAt: string;
}

export type EmergencyPlanPayload = {
  code?: string;
  name: string;
  level: PlanResponseLevel | PlanColorLevel;
  status?: PlanStatus;
  description?: string;
  content?: EmergencyPlan['content'];
  applicable_scenarios?: string[];
  commander?: string;
  commander_phone?: string;
};

export type EmergencyPlanStats = {
  total: number;
  draft: number;
  active: number;
  archived: number;
  by_level: Record<string, number>;
  by_color: Record<string, number>;
};

export type EmergencyPlanRelated = {
  plan: Record<string, unknown>;
  open_warnings: Array<{
    id: number;
    code: string;
    level: string;
    status: string;
    trigger_type: string;
    hazard_point__code: string;
    hazard_point__name: string;
    created_at: string;
  }>;
  evacuations: Array<{
    id: number;
    code: string;
    status: string;
    total_people: number;
    transferred_people: number;
    shelter_name?: string;
    hazard_point__name?: string;
  }>;
  supplies: Array<{
    id: number;
    code: string;
    name: string;
    category: string;
    quantity: number;
    unit: string;
    storage_location?: string;
  }>;
  color_level: PlanColorLevel;
};

export type PlanLaunchResult = {
  plan: Record<string, unknown>;
  warning: { id: number; code: string; status: string; level: string };
  evacuation: {
    id: number;
    code: string;
    status: string;
    total_people: number;
  } | null;
  message: string;
};

export type EvacuationStatus = 'pending' | 'ongoing' | 'completed' | 'cancelled';

export interface EvacuationTask {
  /** 业务编号，如 EV001 */
  id: string;
  /** 数据库主键 */
  dbId: number;
  warningId: string;
  warningDbId: number | null;
  warningCode: string;
  warningLevel: string;
  hazardPointId: string;
  hazardPointDbId: number | null;
  pointName: string;
  pointCode: string;
  pointLevel: string;
  hazardLng: number | null;
  hazardLat: number | null;
  riskArea: string;
  riskDesc: string;
  totalPeople: number;
  transferredPeople: number;
  completionRate: number;
  peopleList: Array<{
    name: string;
    idCard: string;
    phone: string;
    isTransferred: boolean;
    transferTime?: string;
  }>;
  commander: string;
  commanderPhone: string;
  gridWorker: string;
  gridPhone: string;
  shelter: string;
  shelterAddress: string;
  shelterLng: number | null;
  shelterLat: number | null;
  route: {
    path: [number, number][];
    distance: number;
    estimatedTime: number;
    /** mapbox | osrm | interpolate */
    provider?: string;
  };
  status: EvacuationStatus;
  statusDisplay: string;
  createTime: string;
  updateTime: string;
}

export type EvacuationTaskStats = {
  total_tasks: number;
  pending: number;
  ongoing: number;
  completed: number;
  cancelled: number;
  total_people: number;
  transferred_people: number;
  pending_people: number;
  completion_rate: number;
  shelter_count: number;
  route_count: number;
};

export type EvacuationGeoJSON = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry:
      | { type: 'Point'; coordinates: [number, number] }
      | { type: 'LineString'; coordinates: [number, number][] };
    properties: Record<string, unknown>;
  }>;
};

export type EvacuationShelter = {
  name: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
  task_count: number;
  total_people: number;
  transferred_people: number;
  tasks: Array<{
    id: number;
    code: string;
    status: string;
    hazard_point: string;
  }>;
};

export type EmergencySupplyCategory =
  | 'food'
  | 'water'
  | 'tent'
  | 'medical'
  | 'tool'
  | 'other';

export interface EmergencySupply {
  id: number;
  code: string;
  name: string;
  category: EmergencySupplyCategory;
  categoryDisplay: string;
  quantity: number;
  unit: string;
  storageLocation: string;
  responsiblePerson: string;
  contactPhone: string;
  lastCheckDate?: string;
  stockStatus: '充足' | '偏低';
  createdAt: string;
  updatedAt: string;
}

export type EmergencySupplyPayload = {
  code?: string;
  name: string;
  category: EmergencySupplyCategory;
  quantity: number;
  unit?: string;
  storage_location?: string;
  responsible_person?: string;
  contact_phone?: string;
  last_check_date?: string | null;
};

export type EmergencySupplyStats = {
  total: number;
  low_stock: number;
  by_category: Record<string, number>;
};

export type SystemUserRole = 'admin' | 'leader' | 'operator' | 'grid_worker' | 'viewer';

export interface SystemUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  role: SystemUserRole | string;
  roleDisplay: string;
  department: string;
  village: string;
  isActive: boolean;
  dateJoined: string;
}

export type SystemUserPayload = {
  username: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role?: SystemUserRole | string;
  department?: string;
  village?: string;
  is_active?: boolean;
  email?: string;
};

export type EvacuationRelated = {
  task: Record<string, unknown>;
  warning: {
    id: number;
    code: string;
    level: string;
    status: string;
    trigger_type?: string;
  } | null;
  sibling_tasks: Array<{
    id: number;
    code: string;
    status: string;
    shelter_name: string;
    total_people: number;
    transferred_people: number;
  }>;
  matched_plans: Array<{
    id: number;
    code: string;
    name: string;
    level: string;
    commander: string;
  }>;
};

export type EvacuationTaskPayload = {
  code?: string;
  warning?: number | null;
  hazard_point: number;
  status?: EvacuationStatus;
  total_people?: number;
  transferred_people?: number;
  shelter_name?: string;
  shelter_address?: string;
  shelter_longitude?: number | null;
  shelter_latitude?: number | null;
  route_path?: [number, number][];
  commander?: string;
  commander_phone?: string;
  grid_worker?: string;
  grid_phone?: string;
};

/** ---------- 生态治理工程 ---------- */

export type EcologyProjectType =
  | 'anchor'
  | 'drainage'
  | 'vegetation'
  | 'retaining'
  | 'other';

export type EcologyProjectStatus =
  | 'designing'
  | 'approved'
  | 'construction'
  | 'completed'
  | 'archived';

export type EcologyEffect =
  | 'significant'
  | 'qualified'
  | 'monitoring'
  | 'failed';

export type EcologyMilestone = {
  order: number;
  title: string;
  status: string;
};

export interface EcologyProject {
  id: number;
  code: string;
  name: string;
  projectType: EcologyProjectType;
  projectTypeDisplay: string;
  status: EcologyProjectStatus;
  statusDisplay: string;
  hazardPointId: number | null;
  hazardPointName: string;
  location: string;
  description: string;
  budget: number;
  budgetDisplay: string;
  progress: number;
  plannedDays: number;
  doneDays: number;
  currentMilestone: string;
  milestones: EcologyMilestone[];
  designer: string;
  contractor: string;
  manager: string;
  managerPhone: string;
  designDate?: string;
  approveDate?: string;
  startDate?: string;
  endDate?: string;
  actualEndDate?: string;
  progressLogCount?: number;
  assessmentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type EcologyProjectPayload = {
  code?: string;
  name: string;
  project_type: EcologyProjectType;
  status?: EcologyProjectStatus;
  hazard_point?: number | null;
  location?: string;
  description?: string;
  budget?: number;
  progress?: number;
  planned_days?: number;
  done_days?: number;
  current_milestone?: string;
  milestones?: EcologyMilestone[];
  designer?: string;
  contractor?: string;
  manager?: string;
  manager_phone?: string;
  design_date?: string | null;
  end_date?: string | null;
};

export type EcologyProjectStats = {
  total: number;
  designing: number;
  approved: number;
  construction: number;
  completed: number;
  archived: number;
  avg_progress: number;
  total_budget: number;
  by_type: Record<string, number>;
};

export type EcologyProjectRelated = {
  project: Record<string, unknown>;
  progress_logs: EcologyProgressLog[];
  assessments: EcologyAssessment[];
  can_assess: boolean;
};

export interface EcologyProgressLog {
  id: number;
  projectId: number;
  projectCode: string;
  projectName: string;
  projectStatus: string;
  projectType: string;
  plannedDays: number;
  progress: number;
  doneDays: number;
  milestone: string;
  note: string;
  reporter: string;
  reportDate: string;
  createdAt: string;
}

export type EcologyProgressPayload = {
  project: number;
  progress: number;
  done_days?: number;
  milestone?: string;
  note?: string;
  reporter?: string;
  report_date?: string;
};

export type EcologyProgressBoardItem = {
  project: EcologyProject;
  latest_log: EcologyProgressLog | null;
};

export type EcologyProgressStats = {
  project_count: number;
  construction: number;
  completed: number;
  avg_progress: number;
  log_count: number;
  latest_report: string | null;
};

export interface EcologyAssessment {
  id: number;
  code: string;
  projectId: number;
  projectCode: string;
  projectName: string;
  projectStatus: string;
  factor: string;
  beforeValue: string;
  afterValue: string;
  unit: string;
  effect: EcologyEffect;
  effectDisplay: string;
  conclusion: string;
  assessor: string;
  assessDate: string;
  createdAt: string;
}

export type EcologyAssessmentPayload = {
  code?: string;
  project: number;
  factor: string;
  before_value?: string;
  after_value?: string;
  unit?: string;
  effect?: EcologyEffect;
  conclusion?: string;
  assessor?: string;
  assess_date?: string;
};

export type EcologyAssessmentStats = {
  total: number;
  significant: number;
  qualified: number;
  monitoring: number;
  failed: number;
  project_covered: number;
};

export interface DashboardStats {
  generatedAt: string;
  hazardTotal: number;
  hazardTrend: number;
  hazardNewMonth?: number;
  deviceOnline: number;
  deviceTotal: number;
  deviceRate: number;
  deviceByStatus?: {
    online: number;
    offline: number;
    fault: number;
    other: number;
  };
  todayWarnings: number;
  warningTrend: number;
  openWarnings?: number;
  pendingConfirm?: number;
  pendingTasks: number;
  tasksTrend: number;
  inspectOpen?: number;
  evacOpen?: number;
  warnActionable?: number;
  transferredPeople: number;
  peopleTrend: number;
  warningByLevel?: Record<'red' | 'orange' | 'yellow' | 'blue', number>;
  hazardTypeDistribution?: Array<{
    key: string;
    name: string;
    value: number;
    color: string;
  }>;
  monthlyWarnings?: Array<{
    month: number;
    label: string;
    warnings: number;
    closed: number;
  }>;
  monitorTrend?: Array<{
    time: string;
    force: number;
    rainfall: number;
    displacement: number;
  }>;
  latestWarnings?: Array<{
    id: number;
    code: string;
    hazardPointName: string;
    hazardPointCode: string;
    level: string;
    levelDisplay: string;
    status: string;
    statusDisplay: string;
    triggerType: string;
    confidence: number;
    createTime: string;
  }>;
  todoTasks?: Array<{
    id: string;
    label: string;
    time: string;
    type: string;
    href: string;
    priority: string;
    status: string;
  }>;
  hotspots?: Array<{
    id: number;
    code: string;
    name: string;
    level: string;
    status: string;
    type: string;
    longitude: number | null;
    latitude: number | null;
    threatPeople: number;
    town: string;
    village: string;
  }>;
  evacSummary?: {
    pending: number;
    ongoing: number;
    completed: number;
    totalPeople: number;
    transferredPeople: number;
    pendingPeople: number;
  };
  overallRisk?: {
    level: string;
    label: string;
    score: number;
  };
}

export type DisasterStatSlice = {
  key?: string;
  name: string;
  value: number;
  color?: string;
};

export type DisasterRegionStat = {
  name: string;
  hazard_count: number;
  threat_people: number;
  warning_count: number;
};

export type DisasterHighRiskPoint = {
  id: number;
  code: string;
  name: string;
  type: string;
  type_display: string;
  level: string;
  level_display: string;
  status: string;
  status_display: string;
  town: string;
  village: string;
  threat_people: number;
  open_warning_count: number;
};

export type DisasterRecentWarning = {
  id: number;
  code: string;
  level: string;
  level_display: string;
  status: string;
  status_display: string;
  hazard_code: string;
  hazard_name: string;
  created_at: string;
  has_evacuation: boolean;
  closed: boolean;
};

export type PerformanceStatistics = {
  year: number;
  generated_at: string;
  summary: {
    avg_response_minutes: number;
    response_improve_pct: number | null;
    avg_closure_hours: number;
    closure_improve_pct: number | null;
    closure_rate: number;
    closure_rate_delta: number | null;
    year_closure_rate: number;
    inspect_coverage: number;
    coverage_delta: number;
    hazards_covered: number;
    hazard_total: number;
    confirm_rate: number;
    inspect_ontime_rate: number;
    avg_inspect_duration: number;
    evacuation_complete_rate: number;
    people_transfer_rate: number;
    device_online_rate: number;
    device_online: number;
    device_total: number;
    month_warnings: number;
    sample_response_count: number;
    sample_closure_count: number;
  };
  monthly_efficiency: Array<{
    month: number;
    label: string;
    response: number;
    closure: number;
    warnings: number;
    closed: number;
    closure_rate: number;
  }>;
  funnel: {
    warnings_created: number;
    warnings_confirmed: number;
    warnings_closed: number;
    evacuations_launched: number;
    evacuations_completed: number;
    inspections_completed: number;
    hazards_covered: number;
  };
  slow_responses: Array<{
    id: number;
    code: string;
    hazard_name: string;
    level: string;
    level_display: string;
    status: string;
    status_display: string;
    response_minutes: number;
    created_at: string;
  }>;
  loop: {
    description: string;
    metrics: string[];
  };
};

export type DisasterStatistics = {
  year: number;
  generated_at: string;
  summary: {
    hazard_total: number;
    hazard_new_month: number;
    hazard_trend_pct: number;
    month_warnings: number;
    month_warnings_delta: number;
    month_closed_warnings: number;
    month_closed_actions: number;
    closure_rate: number;
    year_warnings: number;
    year_closure_rate: number;
    open_warnings: number;
    year_transferred_people: number;
    year_need_transfer: number;
    threat_people_total: number;
    threat_houses_total: number;
    threat_assets_total: number;
    inspection_done_month: number;
    inspection_issues_month: number;
    evacuations_from_warning: number;
    evacuations_completed: number;
  };
  monthly_warnings: Array<{
    month: number;
    label: string;
    count: number;
    closed: number;
  }>;
  type_distribution: DisasterStatSlice[];
  level_distribution: DisasterStatSlice[];
  status_distribution: DisasterStatSlice[];
  warning_level_distribution: DisasterStatSlice[];
  region_distribution: DisasterRegionStat[];
  high_risk_points: DisasterHighRiskPoint[];
  recent_warnings: DisasterRecentWarning[];
  loop: {
    description: string;
    warning_with_evacuation: number;
    hazard_in_warning_or_emergency: number;
    inspection_issues_synced_hint: string;
  };
};

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}
