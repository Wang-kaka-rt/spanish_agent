# Spanish Agent

## 目录说明

- `server`：FastAPI 后端、数据库模型、迁移、模板导入、合同生成与聊天服务
- `web`：Electron + React 前端
- `resources`：初始合同模板资源

## 快速启动

### 1. 启动后端

```powershell
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. 启动前端

```powershell
cd web
npm install
npm run dev
```

## 测试

后端测试：

```powershell
cd server
python -m pytest tests -vv
```

前端构建验证：

```powershell
cd web
npm run build
```

## Docker

如果希望直接用容器启动后端配套服务：

```powershell
docker-compose up --build
```
