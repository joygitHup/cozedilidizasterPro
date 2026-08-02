import type {
  DashboardStats,
  HazardPoint,
  MonitoringDevice,
  WarningRecord,
  EvacuationTask,
  MonitorDataPoint,
} from '@/types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getDashboardStats(): Promise<DashboardStats> {
  await delay(200);
  return {
    hazardTotal: 1284,
    hazardTrend: 3.2,
    deviceOnline: 356,
    deviceTotal: 420,
    deviceRate: 84.8,
    todayWarnings: 16,
    warningTrend: 2,
    pendingTasks: 5,
    tasksTrend: -2,
    transferredPeople: 328,
    peopleTrend: 156,
  };
}

export async function getLatestWarnings(limit = 5): Promise<WarningRecord[]> {
  await delay(150);
  const warnings: WarningRecord[] = [
    {
      id: 'W202607301023',
      hazardPointId: 'HS001',
      hazardPointName: '竹林坡',
      level: 'red',
      triggerType: '牛顿力突降+降雨',
      triggerValue: { force: 85.6, rainfall: 45 },
      confidence: 87.3,
      status: 'confirmed',
      confirmTime: '2026-07-30 10:25:10',
      confirmUser: '张值班',
      createTime: '2026-07-30 10:23:15',
      updateTime: '2026-07-30 10:26:00',
      timeline: [
        { time: '10:23:15', event: '预警触发', status: 'completed' },
        { time: '10:23:30', event: '自动呼叫(成功)', status: 'completed' },
        { time: '10:25:10', event: '值班员确认', status: 'completed' },
        { time: '10:26:00', event: '待发布指令', status: 'current' },
      ],
    },
    {
      id: 'W202607300945',
      hazardPointId: 'HS002',
      hazardPointName: '石桥镇',
      level: 'orange',
      triggerType: '位移超阈值',
      triggerValue: { displacement: 12.3 },
      confidence: 78.5,
      status: 'published',
      publishTime: '2026-07-30 09:50:00',
      createTime: '2026-07-30 09:45:00',
      updateTime: '2026-07-30 09:50:00',
      timeline: [
        { time: '09:45:00', event: '预警触发', status: 'completed' },
        { time: '09:46:00', event: '自动呼叫', status: 'completed' },
        { time: '09:48:00', event: '值班确认', status: 'completed' },
        { time: '09:50:00', event: '发布转移指令', status: 'completed' },
        { time: '10:00:00', event: '等待转移反馈', status: 'current' },
      ],
    },
    {
      id: 'W202607300812',
      hazardPointId: 'HS003',
      hazardPointName: '李家坪',
      level: 'yellow',
      triggerType: '降雨量预警',
      triggerValue: { rainfall: 38 },
      confidence: 65.2,
      status: 'closed',
      closeTime: '2026-07-30 11:00:00',
      closeReason: '降雨减弱，风险降低',
      createTime: '2026-07-30 08:12:00',
      updateTime: '2026-07-30 11:00:00',
      timeline: [
        { time: '08:12:00', event: '预警触发', status: 'completed' },
        { time: '08:14:00', event: '自动呼叫', status: 'completed' },
        { time: '08:16:00', event: '值班确认', status: 'completed' },
        { time: '08:20:00', event: '发布预警', status: 'completed' },
        { time: '11:00:00', event: '闭环归档', status: 'completed' },
      ],
    },
    {
      id: 'W202607300730',
      hazardPointId: 'HS004',
      hazardPointName: '王家坎',
      level: 'yellow',
      triggerType: '含水量升高',
      triggerValue: { moisture: 32 },
      confidence: 58.1,
      status: 'pending',
      createTime: '2026-07-30 07:30:00',
      updateTime: '2026-07-30 07:30:00',
      timeline: [
        { time: '07:30:00', event: '预警触发', status: 'current' },
      ],
    },
    {
      id: 'W202607300650',
      hazardPointId: 'HS005',
      hazardPointName: '赵家崖',
      level: 'blue',
      triggerType: '常规监测',
      triggerValue: { stress: 25 },
      confidence: 42.0,
      status: 'closed',
      createTime: '2026-07-30 06:50:00',
      updateTime: '2026-07-30 08:30:00',
      timeline: [
        { time: '06:50:00', event: '预警触发', status: 'completed' },
        { time: '08:30:00', event: '闭环归档', status: 'completed' },
      ],
    },
  ];
  return warnings.slice(0, limit);
}

export async function getHazardPoints(params?: {
  page?: number;
  pageSize?: number;
  level?: string;
  status?: string;
  search?: string;
}): Promise<{ list: HazardPoint[]; total: number }> {
  await delay(200);
  const allPoints: HazardPoint[] = [
    {
      id: 'HS001', code: 'HS001', name: '竹林坡', type: 'landslide',
      level: 'red', status: 'warning',
      location: { lng: 104.0668, lat: 30.5728, address: 'A镇竹林村后山', village: '竹林村', town: 'A镇', county: '边阳县' },
      scale: { volume: 50000, length: 120, width: 80, height: 45 },
      threat: { people: 156, houses: 23, roads: 500, assets: 1200 },
      coefficient: 1.05, createTime: '2025-03-15', updateTime: '2026-07-30',
      responsiblePerson: '张三', contactPhone: '138xxxx1234', photos: [], files: [],
    },
    {
      id: 'HS002', code: 'HS002', name: '石桥崖', type: 'collapse',
      level: 'orange', status: 'attention',
      location: { lng: 104.1234, lat: 30.6234, address: 'B镇石桥村崖壁', village: '石桥村', town: 'B镇', county: '边阳县' },
      scale: { volume: 30000, length: 80, width: 60, height: 35 },
      threat: { people: 89, houses: 12, roads: 300, assets: 800 },
      coefficient: 1.08, createTime: '2025-05-20', updateTime: '2026-07-29',
      responsiblePerson: '李四', contactPhone: '139xxxx5678', photos: [], files: [],
    },
    {
      id: 'HS003', code: 'HS003', name: '李家坪', type: 'debris_flow',
      level: 'yellow', status: 'stable',
      location: { lng: 104.0890, lat: 30.5890, address: 'A镇李家坪沟口', village: '李家坪', town: 'A镇', county: '边阳县' },
      scale: { volume: 80000, length: 200, width: 50, height: 30 },
      threat: { people: 23, houses: 5, roads: 150, assets: 350 },
      coefficient: 1.15, createTime: '2025-06-10', updateTime: '2026-07-28',
      responsiblePerson: '王五', contactPhone: '137xxxx9012', photos: [], files: [],
    },
    {
      id: 'HS004', code: 'HS004', name: '王家坎', type: 'landslide',
      level: 'yellow', status: 'attention',
      location: { lng: 104.1567, lat: 30.6012, address: 'C镇王家坎', village: '王家村', town: 'C镇', county: '边阳县' },
      scale: { volume: 25000, length: 60, width: 40, height: 25 },
      threat: { people: 45, houses: 8, roads: 200, assets: 500 },
      coefficient: 1.12, createTime: '2025-07-01', updateTime: '2026-07-27',
      responsiblePerson: '赵六', contactPhone: '136xxxx3456', photos: [], files: [],
    },
    {
      id: 'HS005', code: 'HS005', name: '赵家崖', type: 'others',
      level: 'blue', status: 'stable',
      location: { lng: 104.2012, lat: 30.6456, address: 'C镇赵家崖', village: '赵家村', town: 'C镇', county: '边阳县' },
      scale: { volume: 15000, length: 40, width: 30, height: 20 },
      threat: { people: 12, houses: 3, roads: 100, assets: 200 },
      coefficient: 1.20, createTime: '2025-08-15', updateTime: '2026-07-25',
      responsiblePerson: '孙七', contactPhone: '135xxxx7890', photos: [], files: [],
    },
  ];

  let filtered = [...allPoints];
  if (params?.level) filtered = filtered.filter((p) => p.level === params.level);
  if (params?.status) filtered = filtered.filter((p) => p.status === params.status);
  if (params?.search) {
    const s = params.search.toLowerCase();
    filtered = filtered.filter(
      (p) => p.name.includes(s) || p.code.toLowerCase().includes(s)
    );
  }

  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 10;
  const start = (page - 1) * pageSize;
  return { list: filtered.slice(start, start + pageSize), total: filtered.length };
}

export async function getMonitoringDevices(): Promise<MonitoringDevice[]> {
  await delay(200);
  return [
    {
      id: 'NPR-001', name: 'NPR-001', type: 'npr_anchor', status: 'online',
      location: { lng: 104.0668, lat: 30.5728, address: '竹林坡' },
      installDate: '2025-06-01',
      specs: { range: '0-2000MPa', accuracy: '0.1% FS', power: 2 },
      battery: 87, signal: 'strong', lastDataTime: '2026-07-30 10:23',
      data: generateMockData('force', 'MPa', 24),
    },
    {
      id: 'RAIN-001', name: 'RAIN-001', type: 'rainfall', status: 'online',
      location: { lng: 104.0670, lat: 30.5730, address: '竹林坡' },
      installDate: '2025-06-01',
      specs: { range: '0-4mm/min', accuracy: '±0.1mm', power: 1 },
      battery: 92, signal: 'strong', lastDataTime: '2026-07-30 10:20',
      data: generateMockData('rainfall', 'mm', 24),
    },
    {
      id: 'FIB-001', name: 'FIB-001', type: 'fiber_optic', status: 'online',
      location: { lng: 104.1234, lat: 30.6234, address: '石桥崖' },
      installDate: '2025-07-15',
      specs: { range: '0-5000με', accuracy: '±1με', power: 3 },
      battery: 78, signal: 'medium', lastDataTime: '2026-07-30 10:15',
      data: generateMockData('strain', 'με', 24),
    },
    {
      id: 'CAM-001', name: 'CAM-001', type: 'camera', status: 'online',
      location: { lng: 104.0668, lat: 30.5728, address: '竹林坡' },
      installDate: '2025-06-01',
      specs: { range: '4K/30fps', accuracy: '-', power: 15 },
      battery: 100, signal: 'strong', lastDataTime: '2026-07-30 10:23',
      data: [],
    },
    {
      id: 'NPR-002', name: 'NPR-002', type: 'npr_anchor', status: 'offline',
      location: { lng: 104.0890, lat: 30.5890, address: '李家坪' },
      installDate: '2025-08-01',
      specs: { range: '0-2000MPa', accuracy: '0.1% FS', power: 2 },
      battery: 15, signal: 'weak', lastDataTime: '2026-07-29 22:00',
      data: generateMockData('force', 'MPa', 24),
    },
    {
      id: 'NPR-003', name: 'NPR-003', type: 'npr_anchor', status: 'fault',
      location: { lng: 104.1567, lat: 30.6012, address: '王家坎' },
      installDate: '2025-09-01',
      specs: { range: '0-2000MPa', accuracy: '0.1% FS', power: 2 },
      battery: 45, signal: 'weak', lastDataTime: '2026-07-30 08:00',
      data: generateMockData('force', 'MPa', 24),
    },
  ];
}

export async function getEvacuationTasks(): Promise<EvacuationTask[]> {
  await delay(200);
  return [
    {
      id: 'EV001', warningId: 'W202607301023', hazardPointId: 'HS001',
      pointName: '竹林坡', pointLevel: '红色',
      riskArea: '竹林村后山影响区', riskDesc: '滑坡体前缘500m范围',
      totalPeople: 156, transferredPeople: 143,
      peopleList: [],
      commander: '张指挥', commanderPhone: '138xxxx0001',
      gridWorker: '李四', gridPhone: '139xxxx5678',
      shelter: '村小学', shelterAddress: '竹林村小学操场',
      route: { path: [[104.0668, 30.5728], [104.0680, 30.5740], [104.0700, 30.5750]], distance: 2.3, estimatedTime: 35 },
      status: 'ongoing', createTime: '2026-07-30 10:30:00', updateTime: '2026-07-30 10:45:00',
    },
    {
      id: 'EV002', warningId: 'W202607300945', hazardPointId: 'HS002',
      pointName: '石桥崖', pointLevel: '橙色',
      riskArea: '石桥村崖壁下方', riskDesc: '崩塌影响区域',
      totalPeople: 89, transferredPeople: 89,
      peopleList: [],
      commander: '王指挥', commanderPhone: '138xxxx0002',
      gridWorker: '赵六', gridPhone: '136xxxx3456',
      shelter: '镇政府', shelterAddress: 'B镇人民政府',
      route: { path: [[104.1234, 30.6234], [104.1250, 30.6250], [104.1280, 30.6270]], distance: 4.1, estimatedTime: 55 },
      status: 'completed', createTime: '2026-07-30 09:50:00', updateTime: '2026-07-30 10:45:00',
    },
    {
      id: 'EV003', warningId: 'W202607300812', hazardPointId: 'HS003',
      pointName: '李家坪', pointLevel: '黄色',
      riskArea: '李家坪沟口', riskDesc: '泥石流影响区',
      totalPeople: 23, transferredPeople: 20,
      peopleList: [],
      commander: '李指挥', commanderPhone: '138xxxx0003',
      gridWorker: '孙七', gridPhone: '135xxxx7890',
      shelter: '社区中心', shelterAddress: 'A镇社区活动中心',
      route: { path: [[104.0890, 30.5890], [104.0900, 30.5900]], distance: 1.5, estimatedTime: 20 },
      status: 'ongoing', createTime: '2026-07-30 08:20:00', updateTime: '2026-07-30 09:00:00',
    },
  ];
}

function generateMockData(type: MonitorDataPoint['type'], unit: string, hours: number): MonitorDataPoint[] {
  const now = new Date('2026-07-30T10:23:00');
  const data: MonitorDataPoint[] = [];
  for (let i = hours; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600000);
    const baseValue = type === 'force' ? 45 : type === 'rainfall' ? 5 : type === 'strain' ? 200 : 10;
    const variance = type === 'force' ? 30 : type === 'rainfall' ? 40 : type === 'strain' ? 150 : 8;
    data.push({
      time: time.toISOString(),
      value: Math.round((baseValue + Math.sin(i / 3) * variance + Math.random() * variance * 0.3) * 100) / 100,
      type,
      unit,
      threshold: type === 'force' ? { yellow: 50, orange: 70, red: 85 } : undefined,
    });
  }
  return data;
}

export async function getWarningList(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  level?: string;
}): Promise<{ list: WarningRecord[]; total: number }> {
  await delay(200);
  const all = await getLatestWarnings(50);
  let filtered = [...all];
  if (params?.status) filtered = filtered.filter((w) => w.status === params.status);
  if (params?.level) filtered = filtered.filter((w) => w.level === params.level);
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 10;
  const start = (page - 1) * pageSize;
  return { list: filtered.slice(start, start + pageSize), total: filtered.length };
}
