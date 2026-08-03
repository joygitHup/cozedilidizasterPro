# 边坡地质灾害智能预防管控平台

## 项目概述
地质灾害智能预防管控后台管理系统，面向县级自然资源/应急管理部门，提供隐患台账、监测感知、智能预警、应急响应等全流程管控能力。

采用前后端分离架构：
- **前端**: Next.js 16 (App Router) + React 19 + TypeScript
- **后端**: Django 4.2 + Django REST Framework

## 技术栈

### 前端
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19, TypeScript 5
- **UI**: shadcn/ui (Radix UI) + Tailwind CSS 4
- **Charts**: Recharts
- **Icons**: Lucide React
- **Package Manager**: pnpm

### 后端
- **Framework**: Django 4.2 LTS + Django REST Framework
- **Database**: SQLite (开发) / PostgreSQL + PostGIS (生产)
- **CORS**: django-cors-headers
- **Filter**: django-filter
- **Package Manager**: pip3

## 目录结构
```
├── src/                        # 前端源码
│   ├── app/                    # 页面路由
│   │   ├── dashboard/          # 驾驶舱总览
│   │   ├── hazard/             # 隐患台账管理
│   │   ├── monitoring/         # 监测感知网络
│   │   ├── warning/            # 智能预警中心
│   │   ├── emergency/          # 应急响应处置
│   │   └── ...
│   ├── components/
│   │   ├── layout/             # 布局组件 (Sidebar, Header)
│   │   └── ui/                 # shadcn/ui 组件
│   ├── lib/
│   └── types/
│
├── backend/                    # 后端 Django 项目
│   ├── config/                 # Django 配置
│   │   ├── settings.py         # 主配置
│   │   └── urls.py             # 主路由
│   ├── users/                  # 用户认证模块
│   ├── hazard/                 # 隐患台账模块
│   ├── monitoring/             # 监测感知模块
│   ├── warning/                # 智能预警模块
│   ├── emergency/              # 应急响应模块
│   ├── init_data.py            # 示例数据初始化
│   └── manage.py               # Django 管理命令
│
└── scripts/                    # 启动脚本
```

## API 接口

### 用户认证
- `POST /api/users/login/` - 用户登录
- `POST /api/users/logout/` - 用户登出
- `GET /api/users/profile/` - 获取用户信息

### 隐患台账
- `GET /api/hazard/points/` - 隐患点列表
- `POST /api/hazard/points/` - 创建隐患点
- `GET /api/hazard/points/{id}/` - 隐患点详情
- `GET /api/hazard/slopes/` - 风险斜坡列表
- `GET /api/hazard/inspections/` - 排查任务列表

### 监测感知
- `GET /api/monitoring/devices/` - 设备列表
- `GET /api/monitoring/devices/{id}/data/` - 设备监测数据
- `POST /api/monitoring/data/` - 上报监测数据

### 智能预警
- `GET /api/warning/records/` - 预警记录列表
- `POST /api/warning/records/{id}/confirm/` - 确认预警
- `POST /api/warning/records/{id}/close/` - 关闭预警
- `GET /api/warning/models/` - 预警模型列表

### 应急响应
- `GET /api/emergency/plans/` - 预案列表
- `GET /api/emergency/evacuation/` - 转移任务列表
- `GET /api/emergency/supplies/` - 物资列表

## 运行与预览

### 开发模式
```bash
# 启动脚本会同时启动前后端
bash scripts/dev.sh
```

- 前端: http://localhost:5000
- 后端: http://localhost:8000
- API 代理: 前端 /api/* 请求自动代理到后端

### 生产部署
```bash
# 构建
bash scripts/build.sh

# 启动
bash scripts/start.sh
```

## 测试账号
- 管理员: admin / admin123
- 值班领导: leader / leader123
- 值班员: operator / operator123
- 网格员: zhangsan / zhangsan123

## 设计风格
深色科技感主题（Dark Sci-Fi），参考指挥中心大屏视觉。主色 Cyan #06b6d4，背景 #030712。
