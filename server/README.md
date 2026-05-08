# Spanish Agent Server

## 本地开发

建议使用独立虚拟环境，避免和机器上的全局 Python 依赖冲突。

```powershell
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## 启动方式

开发模式直接运行：

```powershell
cd server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

首次启动会根据 `.env` 自动执行以下动作：

- 创建 `storage/templates` 和 `storage/exports`
- 在 `AUTO_CREATE_TABLES=true` 时自动建表
- 在 `AUTO_INGEST_TEMPLATES=true` 且模板表为空时自动导入 `resources/HOJA DE ENCARGO`

## 测试

```powershell
cd server
python -m pytest tests -vv
```

## 迁移

应用现有迁移：

```powershell
cd server
alembic upgrade head
```

生成新迁移：

```powershell
cd server
alembic revision -m "your message"
```
