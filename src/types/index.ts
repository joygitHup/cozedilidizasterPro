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
}

export interface MonitoringDevice {
  id: string;
  name: string;
  type: 'npr_anchor' | 'rainfall' | 'fiber_optic' | 'camera' | 'others';
  status: 'online' | 'offline' | 'fault';
  location: { lng: number; lat: number; address: string };
  installDate: string;
  specs: {
    range: string;
    accuracy: string;
    power: number;
  };
  battery: number;
  signal: 'strong' | 'medium' | 'weak';
  lastDataTime: string;
  data: MonitorDataPoint[];
}

export interface MonitorDataPoint {
  time: string;
  value: number;
  type: 'force' | 'displacement' | 'rainfall' | 'stress' | 'strain';
  unit: string;
  threshold?: {
    yellow: number;
    orange: number;
    red: number;
  };
}

export interface WarningRecord {
  id: string;
  hazardPointId: string;
  hazardPointName: string;
  level: 'red' | 'orange' | 'yellow' | 'blue';
  triggerType: string;
  triggerValue: Record<string, number>;
  confidence: number;
  status: 'pending' | 'confirmed' | 'analyzing' | 'published' | 'processing' | 'closed';
  confirmTime?: string;
  confirmUser?: string;
  publishTime?: string;
  publishUser?: string;
  closeTime?: string;
  closeReason?: string;
  callStatus?: 'success' | 'failed' | 'timeout';
  createTime: string;
  updateTime: string;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  time: string;
  event: string;
  status: 'completed' | 'pending' | 'current';
}

export interface EvacuationTask {
  id: string;
  warningId: string;
  hazardPointId: string;
  pointName: string;
  pointLevel: string;
  riskArea: string;
  riskDesc: string;
  totalPeople: number;
  transferredPeople: number;
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
  route: {
    path: [number, number][];
    distance: number;
    estimatedTime: number;
  };
  status: 'pending' | 'ongoing' | 'completed' | 'cancelled';
  createTime: string;
  updateTime: string;
}

export interface DashboardStats {
  hazardTotal: number;
  hazardTrend: number;
  deviceOnline: number;
  deviceTotal: number;
  deviceRate: number;
  todayWarnings: number;
  warningTrend: number;
  pendingTasks: number;
  tasksTrend: number;
  transferredPeople: number;
  peopleTrend: number;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}
