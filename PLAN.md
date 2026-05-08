# 西班牙合同智能Agent — 产品总体方案

> 更新时间：2026-05-08

---

## 一、产品定位

面向**西班牙本地公司**（律所、移民中介、商业咨询公司等）的桌面工具，用于合同起草与法律知识管理。

用户下载 Electron 安装包后，界面连接**远端服务器**（PostgreSQL + Redis + FastAPI），所有合同数据、模板文件、法律缓存均存储在服务器端。AI 模型由用户在客户端自行配置，支持对接任意在线 API 或本地运行的模型，API Key 仅存储在用户本机，不上传服务器。

**解决的核心问题：**
- 每次起草合同需要手动套模板，效率低
- 法律条款引用不准确，存在合规风险
- 合同内容高度重复，人工填写耗时

**核心能力：**
1. 根据订单信息，自动匹配服务器端模板 + 从 BOE 获取相关法律，生成完整合同
2. 支持上传新模板，存储在服务器，随时可用
3. 按需从西班牙官方 BOE 抓取法律条文并缓存到 PostgreSQL
4. AI 模型完全由用户在 Electron 客户端配置，API Key 加密存储在本地，不上传服务器

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│              用户本地（Electron 客户端）                      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 React 前端界面                         │  │
│  │   合同生成    模板管理    法律库    设置               │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  electron-store（本地加密存储）                        │  │
│  │  server_url : https://your-server.com                │  │
│  │  provider   : anthropic / openai_compatible / local  │  │
│  │  api_key    : sk-ant-xxxx（仅存本地，不上传服务器）   │  │
│  │  model_id   : claude-opus-4-7                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTPS / WebSocket
                              │（携带模型配置，不含永久存储）
┌─────────────────────────────▼───────────────────────────────┐
│                    远端服务器                                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Nginx（反向代理，SSL 终止，静态资源）                 │  │
│  └──────────────────────────┬─────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼─────────────────────────────┐  │
│  │            Python FastAPI 后端（uvicorn）               │  │
│  │                                                        │  │
│  │   TemplateService   BOEService   ContractService       │  │
│  │   DocumentParser    LangGraph 合同生成工作流             │  │
│  └──────┬────────────────────────────────────┬────────────┘  │
│         │                                    │               │
│  ┌──────▼──────────┐               ┌─────────▼─────────┐    │
│  │  PostgreSQL 16  │               │  Redis 7           │    │
│  │                 │               │  会话缓存           │    │
│  │  模板元数据      │               │  生成中间状态       │    │
│  │  法律缓存        │               └────────────────────┘    │
│  │  合同记录        │                                         │
│  │  对话历史        │               ┌────────────────────┐    │
│  └─────────────────┘               │  服务器文件系统     │    │
│                                    │  /app/storage/     │    │
│                                    │    templates/      │    │
│                                    │    exports/        │    │
│                                    └────────────────────┘    │
└──────────────────────────────┬──────────────────────────────┘
                               │ 服务器对外网络请求（仅此两处）
              ┌────────────────┴─────────────────┐
              │                                  │
    ┌─────────▼──────────┐            ┌──────────▼────────┐
    │   AI 模型服务        │            │  boe.es 官方网站   │
    │   Anthropic API /   │            │  按需抓取法律条文   │
    │   Ollama / 其他     │            └───────────────────┘
    └────────────────────┘
```

---

## 三、服务器存储架构

```
远端服务器
├── PostgreSQL 数据库（contracts_db）
│   ├── contract_templates    模板元数据 + 解析后完整文本
│   ├── cached_laws           BOE 法律按需抓取缓存
│   ├── contracts             生成的合同记录 + 导出路径
│   ├── chat_sessions         对话会话
│   └── messages              消息记录
│
├── Redis 7
│   ├── 对话会话缓存
│   └── 合同生成中间状态
│
└── /app/storage/
    ├── templates/            合同模板原始文件（DOCX / PDF）
    │   ├── ASESORAMIENTO/
    │   │   └── HE_Asesoria_legal.docx
    │   ├── EXTRANJERIA/
    │   │   └── HE_Reagrupacion_familiar.docx
    │   ├── GESTORIA/
    │   └── MERCANTIL/
    │
    └── exports/              导出的合同文件
        └── {contract_id}/
            ├── contract.docx
            └── contract.pdf
```

---

## 四、合同生成核心流程

```
用户输入订单信息（自由文字）
"客户王芳，NIE: Y9876543B，服务：家庭团聚居留，费用：1900欧"
    │
    ▼
Step 1  提取结构化字段
        Claude 从订单文字中解析：
        { nombre, nie, tipo_servicio, honorarios, ... }
    │
    ▼
Step 2  选择匹配模板
        从 PostgreSQL 查询所有模板【标题 + 分类 + 子分类】
        Claude 判断最匹配哪个模板
        → 选定"HE Reagrupación familiar"
    │
    ▼
Step 3  加载模板完整文本
        从 PostgreSQL 读取该模板的 raw_text
        （模板上传时已解析存储）
    │
    ▼
Step 4  获取相关法律
        Claude 判断该类合同需要哪些法律条文
        → [Ley 4/2000, RD 557/2011, ...]
        检查 PostgreSQL cached_laws 表：
          有缓存 → 直接读取 raw_text
          无缓存 → httpx 请求 boe.es → 解析 → 写入缓存
    │
    ▼
Step 5  生成完整合同
        输入：模板原文 + 法律文本 + 结构化字段
        PRIMERA（服务内容）→ 根据订单生成 + 引用法律
        SEGUNDA（包含服务）→ 根据订单服务内容生成
        TERCERA（文件要求）→ 依据法规列出材料清单
        CUARTA（费用条款） → 填入金额，中西双语
        QUINTA 及以后      → 固定条款原文照搬
    │
    ▼
Step 6  校验
        检查生成结果是否包含必要条款
        通过 → 保存到 contracts 表
        不通过 → 重试 Step 5（最多 2 次）
    │
    ▼
输出：完整合同文本 → 前端 Monaco Editor 预览编辑 → 导出 DOCX / PDF
```

---

## 五、数据库设计（PostgreSQL）

```sql
-- 合同模板元数据
CREATE TABLE contract_templates (
    id              VARCHAR(36) PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,
    category        VARCHAR(100) NOT NULL,   -- EXTRANJERIA / ASESORAMIENTO / GESTORIA / MERCANTIL
    subcategory     VARCHAR(200),
    file_name       VARCHAR(500) NOT NULL,
    file_path       VARCHAR(500) NOT NULL,   -- 服务器文件系统路径 /app/storage/templates/...
    raw_text        TEXT NOT NULL,           -- 解析后完整文本（供 Claude 直接读取）
    language        VARCHAR(10) DEFAULT 'es',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- BOE 法律缓存（按需抓取，避免重复请求 boe.es）
CREATE TABLE cached_laws (
    id          VARCHAR(36) PRIMARY KEY,
    boe_id      VARCHAR(100) UNIQUE NOT NULL,  -- 如 BOE-A-2000-544
    title       VARCHAR(500) NOT NULL,
    category    VARCHAR(100),                  -- 如 extranjeria / civil
    raw_text    TEXT NOT NULL,                 -- 法律完整原文
    source_url  TEXT,
    fetched_at  TIMESTAMP DEFAULT NOW()
);

-- 生成的合同
CREATE TABLE contracts (
    id                VARCHAR(36) PRIMARY KEY,
    title             VARCHAR(500) NOT NULL,
    template_id       VARCHAR(36) REFERENCES contract_templates(id),
    order_input       TEXT NOT NULL,                -- 用户原始订单输入
    extracted_fields  JSONB DEFAULT '{}',           -- Claude 提取的结构化字段
    generated_text    TEXT,                         -- 最终合同全文
    laws_used         JSONB DEFAULT '[]',           -- 引用法律 [{boe_id, title}]
    status            VARCHAR(50) DEFAULT 'draft',  -- draft / confirmed / exported
    export_docx_path  TEXT,                         -- /app/storage/exports/{id}/contract.docx
    export_pdf_path   TEXT,                         -- /app/storage/exports/{id}/contract.pdf
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

-- 问答会话
CREATE TABLE chat_sessions (
    id         VARCHAR(36) PRIMARY KEY,
    title      VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 消息记录
CREATE TABLE messages (
    id            VARCHAR(36) PRIMARY KEY,
    session_id    VARCHAR(36) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role          VARCHAR(20) NOT NULL,   -- user / assistant
    content       TEXT NOT NULL,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    created_at    TIMESTAMP DEFAULT NOW()
);
```

---

## 六、API 接口

```
系统
  GET    /api/health                       健康检查，返回服务状态

模板管理
  POST   /api/templates/upload             上传 DOCX/PDF → 解析 → 存服务器
  GET    /api/templates                    模板列表
  GET    /api/templates/{id}              模板详情（含 raw_text 预览）
  DELETE /api/templates/{id}             停用模板（软删除）

法律缓存
  GET    /api/laws/boe/search?q=           搜索 BOE 候选列表（不入库）
  POST   /api/laws/boe/fetch              抓取指定法律并缓存到 PostgreSQL
  GET    /api/laws                         已缓存法律列表
  DELETE /api/laws/{id}                   删除指定缓存法律

合同生成
  POST   /api/contracts/generate           输入订单 → LangGraph 生成合同
  GET    /api/contracts                    历史合同列表
  GET    /api/contracts/{id}              合同详情
  PUT    /api/contracts/{id}              编辑合同文本
  GET    /api/contracts/{id}/export/docx  生成并下载 DOCX
  GET    /api/contracts/{id}/export/pdf   生成并下载 PDF
  DELETE /api/contracts/{id}             删除合同记录

问答
  POST   /api/chat/sessions                创建会话
  GET    /api/chat/sessions                会话列表
  WS     /api/chat/{session_id}            流式对话（WebSocket）
  GET    /api/chat/sessions/{id}/history   历史消息
  DELETE /api/chat/sessions/{id}          删除会话
```

---

## 七、技术栈

### 前端（Electron 客户端）

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 桌面框架 | Electron | 28+ | 桌面应用壳，连接远端服务器 |
| UI 框架 | React | 18+ | 界面渲染 |
| 语言 | TypeScript | 5+ | 类型安全 |
| 样式 | Tailwind CSS | 3+ | 原子化样式 |
| 构建工具 | Vite + electron-vite | — | 开发热更新，生产打包 |
| 本地配置存储 | electron-store | — | 服务器地址 + 模型配置加密存储（API Key 只存本地）|
| 状态管理 | Zustand | — | 全局状态（当前模型配置、服务器地址）|
| 服务端状态 | TanStack Query | — | API 请求缓存与管理 |
| 合同编辑器 | Monaco Editor | — | 合同全文预览与行内编辑 |
| HTTP 客户端 | axios | — | 调用远端服务器 REST API |
| WebSocket | 原生 WebSocket | — | 流式对话接收 |
| 文件下载 | file-saver | — | DOCX / PDF 导出下载 |
| 图标库 | Lucide React | — | 界面图标 |
| 打包工具 | electron-builder | — | 生成 Windows / macOS 安装包 |

### 后端（远端服务器）

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 语言 | Python | 3.11+ | — |
| Web 框架 | FastAPI | 0.115+ | REST API + WebSocket 流式输出 |
| ASGI 服务器 | uvicorn | — | 异步生产服务器 |
| 跨域中间件 | FastAPI CORSMiddleware | — | 允许 Electron 客户端跨域请求 |
| ORM | SQLAlchemy | 2.0（async）| 异步数据库操作 |
| 数据库驱动 | asyncpg | — | PostgreSQL 异步驱动 |
| Redis 客户端 | redis[asyncio] | — | 异步操作 Redis 缓存 |
| 数据迁移 | Alembic | — | 数据库版本管理 |
| 数据校验 | Pydantic v2 | — | 请求 / 响应模型定义 |
| 配置管理 | pydantic-settings | — | .env 环境变量读取 |
| 文件上传 | python-multipart | — | 模板 DOCX/PDF 上传接收 |
| 异步文件 | aiofiles | — | 异步读写本地文件 |

### AI / 模型层

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| LLM 工作流编排 | LangGraph | 0.2+ | 合同生成六节点有状态工作流、条件分支、失败重试 |
| Anthropic 集成 | langchain-anthropic | — | Claude 调用 + Prompt Caching 支持 |
| OpenAI 兼容集成 | langchain-community | — | 对接本地 Ollama / DeepSeek / 其他在线 API |
| Anthropic SDK | anthropic | 0.40+ | 原生 Claude API 直接调用 |

### 数据库 / 存储

| 分类 | 技术 | 用途 |
|------|------|------|
| 主数据库 | PostgreSQL 16 | 所有结构化数据：模板元数据、法律缓存、合同记录（远端服务器）|
| 缓存 | Redis 7 | 会话缓存、合同生成中间状态 |
| 文件系统 | 服务器 /app/storage/ | 模板 DOCX/PDF 原始文件 + 导出合同文件 |

### 文档处理

| 分类 | 技术 | 用途 |
|------|------|------|
| DOCX 解析 | python-docx | 读取上传模板的段落与表格文本 |
| PDF 解析 | pdfplumber | 逐页提取 PDF 模板文字 |
| DOCX 生成 | python-docx | 生成可下载合同 Word 文件 |
| PDF 生成 | WeasyPrint | 生成可下载合同 PDF 文件 |

### 法律抓取

| 分类 | 技术 | 用途 |
|------|------|------|
| HTTP 客户端 | httpx | 异步请求 boe.es 官网 |
| HTML 解析 | BeautifulSoup4 + lxml | 提取法律正文内容 |

### 部署

| 分类 | 技术 | 用途 |
|------|------|------|
| 反向代理 | Nginx | SSL 终止、请求转发、静态资源 |
| 容器化 | Docker | 后端服务镜像打包 |
| 编排 | Docker Compose | PostgreSQL + Redis + FastAPI + Nginx 一键启动 |
| 数据库镜像 | postgres:16 | 标准 PostgreSQL（不使用 pgvector 扩展）|

---

## 八、分版本规划

### V1.0 — 远端服务器 Demo
远端 PostgreSQL + Redis，无登录鉴权，单用户场景，核心功能闭环，详见 [V1.0.md](V1.0.md)

### V2.0 — 多租户 SaaS
- 用户注册 / 登录（JWT 鉴权）
- 多租户数据隔离
- 订阅计划 + 用量统计
- 管理员后台

### V3.0 — 高级功能
- 合同审查与风险分析
- 合同版本历史对比
- 多语言界面（西班牙语 / 中文）
- Web 端（无需下载 Electron）

---

## 九、部署方式（V1.0）

**服务器端：**

```
git clone + cd spanish_agent
docker-compose up -d
    │
    ├── PostgreSQL 16 启动（内部 5432）
    ├── Redis 7 启动（内部 6379）
    ├── FastAPI 后端启动（内部 8000）
    ├── Nginx 启动（对外 80 / 443）
    └── 首次运行自动创建数据表 + 导入预置 14 份模板
```

**用户本地：**

```
下载 Electron 安装包 → 安装 → 打开设置
    │
    ├── 填入服务器地址（如 https://your-server.com）
    ├── 配置 AI 模型（选择 provider + 填入 API Key）
    └── API Key 加密存储在本地，不上传服务器，开始使用
```

---

## 十、模型配置策略

| 类型 | provider 值 | 示例 |
|------|------------|------|
| Anthropic API | anthropic | claude-opus-4-7 |
| OpenAI 兼容远端 | openai_compatible | DeepSeek、通义千问 |
| 本地模型 | local | Ollama llama3.2 |

配置加密存储在 electron-store（用户本地），随每次 API 请求一并发送给后端，后端按 `provider` 字段路由调用对应 AI 服务，**不持久化任何 API Key**。
