# Database Upgrade Verification

验证日期：2026-06-17

验证对象：`data/tasks.db`

## 只读检查

使用 Python 标准库 `sqlite3` 以只读模式打开现有数据库，未修改用户数据。

结果：

- 数据库大小：105,148,416 bytes
- `PRAGMA integrity_check`：`ok`
- `PRAGMA foreign_key_check`：0 个问题
- `tasks`：61
- `task_history`：220
- `task_embeddings`：61
- `image_texts`：89
- `ocr_logs`：91
- 最近任务、历史记录、图片 OCR 记录均可读取
- 关键词查询探针返回 31 条匹配

备注：当前原始数据库尚未由新版应用启动，因此只读检查时还没有 `schema_migrations` 表。

## 临时副本迁移模拟

将 `data/tasks.db` 复制到系统临时目录，对副本执行当前初始化/迁移相关 SQL，包括：

- 创建 `schema_migrations`
- 记录 6 条 baseline migration
- 确认核心表存在
- 确认 OCR 字段存在
- 确认任务层级字段存在
- 创建常用索引
- 执行悬空引用清理
- 执行完整性和外键检查

结果：

- `PRAGMA integrity_check`：`ok`
- `PRAGMA foreign_key_check`：0 个问题
- `schema_migrations`：6
- `tasks`：61
- `task_history`：220
- `image_texts`：89
- 关键词查询探针返回 31 条匹配

结论：当前迁移逻辑对现有数据库的结构升级路径可重复执行，且在临时副本中没有破坏任务、历史、图片 OCR 和搜索读取。

