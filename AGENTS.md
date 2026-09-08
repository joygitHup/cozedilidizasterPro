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

### 双模式说明（务必读清）

| 模式 | 何时用 | 入口 | 能力 |
|------|--------|------|------|
| **单体（默认，推荐现场）** | 客户交付、日常开发 | 前端 → Django `:8000` | 全功能：叫应、多引擎、RBAC、路网等 |
| **微服务（可选）** | 按域扩容试验 | 前端 → Gateway `:8088` | Monitor/Warning 为 FastAPI 独立实现；**Warning 能力弱于单体**，现场勿默认开启 |

`dev.ps1` / `dev.sh` **默认不执行** `init_data.py`。需要演示数据时：

```powershell
$env:SEED_DEMO_DATA='1'; & .\scripts\dev.ps1
```

### 开发模式（单体）
```bash
# Windows
& .\scripts\dev.ps1
# 或
bash scripts/dev.sh
```

- 前端: http://localhost:5000
- 后端: http://localhost:8000
- API 代理: 前端 `/api/*` → Django
- 视频 sidecar: `:8600`（通道来自 `services/video/cameras.yaml`，**实施配置 ≠ 设备台账**）

### 微服务模式（绞杀式拆分）
按域拆进程，统一经 API Gateway 入口：

| 服务 | 端口 | 实现 |
|------|------|------|
| Gateway | 8088 | `services/gateway` FastAPI 路由/限流 |
| Core | 8000 | Django `config.urls_core`（用户/隐患/应急/生态/驾驶舱） |
| Monitor | 8001 | **FastAPI + SQLAlchemy**（`services/monitor`，不共用 Django ORM） |
| Warning | 8002 | **FastAPI + SQLAlchemy**（阈值为主；叫应/多引擎弱于单体） |
| Video / Storage | 8600 / 8700 | sidecar |

默认仍共享同一 Postgres（可用 `MONITOR_DATABASE_URL` / `WARNING_DATABASE_URL` 拆库）。
内部调用：`Monitor → Warning /internal/evaluate`（`X-Internal-Token`）。

```powershell
$env:USE_MICROSERVICES=1; & .\scripts\dev.ps1
# 或仅后端：scripts/start-microservices.ps1
```

前端 `BACKEND_URL=http://127.0.0.1:8088`。

### 现场检查清单
1. `.env`：`DEBUG=False`，`DB_ENGINE`/`DB_*` 与现场库一致，更换 `MQTT_INGEST_TOKEN`、`DJANGO_SECRET_KEY`
2. 改管理员密码：`python manage.py change_admin_password --password '强密码'`
3. 清演示数据：`scripts/reset-for-deploy.ps1`；**勿**再跑 `init_data.py`
4. 配置短信/语音 Webhook；未配置时叫应会**显式失败**（勿开 `NOTIFY_ALLOW_CONSOLE` 上现场）
5. 视频：编辑 `services/video/cameras.yaml` 后重启视频服务

### 生产部署
```bash
bash scripts/build.sh
bash scripts/start.sh
```

## 测试账号（仅演示库 / SEED_DEMO_DATA=1）
- 管理员: admin / admin123（现场务必立即修改）
- 值班领导: leader / leader123
- 值班员: operator / operator123
- 网格员: zhangsan / zhangsan123

登录页默认不预填账号；开发可设 `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=1` 显示提示。

## 设计风格
深色科技感主题（Dark Sci-Fi），参考指挥中心大屏视觉。主色 Cyan #06b6d4，背景 #030712。
