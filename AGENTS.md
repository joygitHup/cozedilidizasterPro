# 边坡地质灾害智能预防管控平台

## 项目概述
地质灾害智能预防管控后台管理系统，面向县级自然资源/应急管理部门，提供隐患台账、监测感知、智能预警、应急响应等全流程管控能力。

## 技术栈
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19, TypeScript 5
- **UI**: shadcn/ui (Radix UI) + Tailwind CSS 4
- **Charts**: Recharts
- **Icons**: Lucide React
- **Package Manager**: pnpm

## 目录结构
```
src/
├── app/                    # 页面路由
│   ├── dashboard/          # 驾驶舱总览
│   ├── hazard/             # 隐患台账管理
│   │   ├── points/         # 隐患点管理
│   │   ├── slopes/         # 风险斜坡管理
│   │   └── tasks/          # 排查任务管理
│   ├── monitoring/         # 监测感知网络
│   │   ├── devices/        # 设备管理
│   │   ├── realtime/       # 实时监测数据
│   │   └── video/          # 视频监控
│   ├── warning/            # 智能预警中心
│   │   ├── current/        # 实时预警
│   │   ├── models/         # 预警模型配置
│   │   └── history/        # 历史预警
│   ├── emergency/          # 应急响应处置
│   │   ├── plans/          # 预案管理
│   │   ├── evacuation/     # 避险转移
│   │   └── supplies/       # 应急物资
│   ├── ecology/            # 生态治理工程
│   ├── equipment/          # 材料装备管理
│   ├── geology/            # 三维地质建模
│   ├── inspection/         # 巡查巡检
│   ├── statistics/         # 统计分析
│   └── system/             # 系统管理
├── components/
│   ├── layout/             # 布局组件 (Sidebar, Header)
│   └── ui/                 # shadcn/ui 组件
├── lib/
│   ├── utils.ts            # 工具函数
│   └── mock-data.ts        # Mock 数据
└── types/
    └── index.ts            # 类型定义
```

## 设计风格
深色科技感主题（Dark Sci-Fi），参考指挥中心大屏视觉。主色 Cyan #06b6d4，背景 #030712。

## 运行与预览
- 预览: `bash scripts/build.sh` + `bash scripts/run.sh`
- 端口: 从 `.preview` 读取，fallback 5000
- 绑定: 0.0.0.0
