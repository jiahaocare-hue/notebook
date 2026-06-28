# Task Manager Optimization TODO

本文档是后续优化的唯一跟踪清单。每一项应当能独立提交、独立验证；完成后把 `[ ]` 改为 `[x]`，并补充验证结果。

## 已完成

- [x] 构建恢复：确认 `npm run build` 可以完成前端和 Electron 编译。影响范围：构建链路。验证：`npm run build` 通过。
- [x] lint/typecheck 可运行：将 `lint` 调整为可执行的类型检查门禁，并新增 `typecheck` 脚本。影响范围：质量门禁。验证：`npm run lint` 通过。
- [x] PostCSS/Tailwind 配置警告修复：将配置文件改为 CommonJS，避免 package 全局切到 ESM。影响范围：前端构建配置。验证：`npm run build` 不再出现 PostCSS module 类型警告。
- [x] 数据库常用索引：为任务、历史、embedding、OCR 记录等常用查询字段添加索引。影响范围：SQLite 查询性能。验证：`npm run build` 通过，应用启动时索引使用 `CREATE INDEX IF NOT EXISTS` 安全创建。
- [x] 批量 IPC：新增 `task:getMany` 和 `task:getSubtaskCountsBatch`。影响范围：Electron IPC 和前端 task API。验证：`npm run lint` 通过。
- [x] TodayTasks/Search/Summary 的 N+1 IPC 优化：任务列表子任务计数、搜索父任务加载、摘要历史加载改为批量路径。影响范围：任务列表、搜索、摘要。验证：`npm run lint` 和 `npm run build` 通过。
- [x] 页面级懒加载与 chunk 拆分：Search、Calendar、Summary 改为按需加载。影响范围：前端入口体积和页面加载。验证：`npm run build` 通过，入口 JS chunk 降至约 6 kB。
- [x] `setApiKey/getApiKey` handler 补齐：补全 preload 中已暴露但主进程缺失的兼容 handler。影响范围：配置 IPC。验证：`npm run lint` 通过。

## 高优先级

- [x] 图片加载从 base64 IPC 改为自定义协议或安全 URL。影响范围：任务详情、历史图片、图片查看器、Electron 协议/权限。验证：新增只读 `app-image://local/<encoded-path>` 协议，主进程复用图片目录 containment 校验；前端本地图片预览改为安全 URL，不再通过 IPC 返回 base64；`npm run lint` 和 `npm run build` 通过，仍建议手动点检任务详情图片预览/历史图片预览/图片放大查看。
- [x] 图片路径安全校验。影响范围：`image:load`、`image:delete`、`ocr:retry`、所有读取本地图片的 IPC。验证：新增路径 containment 校验；`npm run lint` 和 `npm run build` 通过。
- [x] Electron 安全加固。影响范围：`BrowserWindow` webPreferences、外部导航、新窗口打开、内容安全策略。验证：限制新窗口/导航，启用 sandbox/webSecurity；`npm run lint` 和 `npm run build` 通过。
- [x] 打包配置统一。影响范围：`package.json` 的 `build` 配置、`electron-builder.yml`、应用名称、图标、发布仓库。验证：移除 package.json 重复 build 块，electron-builder 成功加载 yml；完整目录打包受本机 native 依赖 rebuild 环境阻塞，保留“Electron 打包验证”待办。
- [x] package-lock 同步。影响范围：`package-lock.json` 项目版本和依赖树。验证：lockfile 顶层包名/版本已同步为 `1.4.1`；`npm run lint` 通过。
- [x] OCR worker 复用或队列化。影响范围：`electron/services/ocr.ts`、图片保存、OCR 重试、OCR 进度。验证：复用单个 Tesseract worker，并用队列串行执行识别；识别失败时重置 worker，应用退出时释放 worker；`npm run lint` 和 `npm run build` 通过。
- [x] 拆分 `electron/main.ts`。影响范围：主进程任务、搜索、图片、配置、LLM、OCR、更新检查 IPC 注册。验证：拆分后所有 IPC 名称保持兼容；`npm run lint` 和 `npm run build` 通过。进展：已抽出 `electron/services/search.ts`、`electron/services/config.ts`、`electron/services/database.ts`、`electron/services/images.ts`、`electron/services/query.ts`；图片路径提取、图片目录创建、路径 containment、legacy base64 读取、日期范围过滤、SQL 占位符和批量分片 helper 已服务化；新增 `electron/ipc/config.ts`、`electron/ipc/dialogs.ts`、`electron/ipc/llm.ts`、`electron/ipc/files.ts`、`electron/ipc/app.ts`、`electron/ipc/ocr.ts`、`electron/ipc/tasks.ts`、`electron/ipc/search.ts`、`electron/ipc/imageHandlers.ts`，拆出任务/历史、搜索、图片、配置、窗口/对话框、LLM、文件/剪贴板、应用更新和 OCR/log handler 注册；`electron/main.ts` 仅保留应用生命周期、数据库初始化、图片协议/清理和共享 helper，当前约 584 行；`npm run lint` 和 `npm run build` 通过。
- [x] README 编码/内容清理。影响范围：项目文档。验证：README 在 UTF-8 环境下中文显示正常；补充数据目录重启生效、数据库备份、日志轮转、当前脚本说明；IPC 示例更新为当前 preload 暴露的扁平 API；`npm run lint` 和 `npm run build` 通过。
- [x] `electron-builder.yml` 编码/内容清理。影响范围：Windows/macOS/Linux 打包名称、快捷方式名称、图标路径、发布配置。验证：确认图标与 `resources` 路径存在；移除 `files` 中重复的 `resources/**/*`，仅通过 `extraResources` 提供运行时模型/OCR 资源，避免打包体积重复；`npm run lint` 和 `npm run build` 通过。
- [x] 真实 ESLint 配置补齐。影响范围：代码质量门禁和开发依赖。验证：新增 `eslint.config.mjs`，安装 ESLint/TypeScript/React Hooks/React Refresh 相关依赖；`npm run lint` 现在执行 ESLint 和 typecheck，当前 0 error、0 warning；`npm run build` 通过。

## 性能优化

- [x] 搜索升级为 SQLite FTS5 或抽象搜索层。影响范围：关键词搜索、混合搜索、历史搜索、OCR 图片搜索。验证：已新增 `electron/services/search.ts` 抽象搜索层，关键词/混合关键词匹配/OCR 图片搜索复用服务函数，`npm run lint`、`npm run build` 通过。
- [x] 语义搜索向量解析缓存或二进制存储优化。影响范围：`task_embeddings`、semantic/hybrid search。验证：新增按 `task_id + embedding` 原始字符串校验的内存向量缓存；语义/混合搜索复用解析后的向量，embedding 更新或维度重建时失效缓存；`npm run lint` 和 `npm run build` 通过。
- [x] 日期查询改为可利用索引的范围查询。影响范围：任务列表、计数、搜索、摘要、日历中的 `created_at/updated_at` 日期过滤。验证：主进程将本地日期转换为 UTC 时间边界后使用 `created_at >= ? AND created_at < ?` / `updated_at >= ? AND updated_at < ?`；`npm run lint` 和 `npm run build` 通过。
- [x] 摘要统计下沉到 SQLite 聚合。影响范围：Summary 页面统计、月度/日期分布、状态/优先级分布、平均完成时间。验证：新增 `task:getSummaryStats` 聚合 IPC；Summary 页面并行加载聚合统计和任务明细，图表空日期由前端补齐；`npm run lint` 和 `npm run build` 通过。
- [x] Summary Word 导出依赖按需加载。影响范围：`Summary.tsx`、`docx` 导出路径、页面 chunk 体积。验证：`docx` 改为 Word 导出函数内动态导入；`npm run lint` 和 `npm run build` 通过，Summary 入口 chunk 降至约 40KB，Word 导出库拆为按需 chunk。
- [x] 批量 IPC 自动分片。影响范围：`task:getMany`、`task:getSubtaskCountsBatch`、`task:listWithHistory` 历史批量查询、活动时间线多任务历史查询。验证：新增 900 参数分片 helper；超大活动时间线查询分片后合并排序再分页；`npm run lint` 和 `npm run build` 通过。
- [x] 后台日志降噪与轮转。影响范围：`electron/services/logger.ts`、搜索日志、embedding 日志、OCR 日志。验证：新增 `LOG_LEVEL` 控制、`debug` 日志级别、2MB 日志轮转并保留 5 份；搜索 SQL/参数、embedding 单次生成、图片保存过程日志降为 debug；`npm run lint` 和 `npm run build` 通过。
- [x] 图片/OCR 日志分页和限制策略。影响范围：Settings OCR 日志、`ocr_logs` 查询。验证：`ocr:getLogs` 支持 `limit/offset/total`，单页上限 100；设置页按 20 条分页展示并提供上一页/下一页；`npm run lint` 和 `npm run build` 通过。

## 数据可靠性

- [x] 数据库外键策略梳理。影响范围：`PRAGMA foreign_keys`、任务删除、历史/embedding/OCR 记录关联。验证：初始化清理悬空 `task_history`/`task_embeddings` 引用，悬空 `image_texts`/`ocr_logs` 改为空关联；初始化后开启 `PRAGMA foreign_keys = ON` 并运行 `foreign_key_check`；删除任务不再临时关闭外键；`npm run lint` 和 `npm run build` 通过。
- [x] 图片孤儿文件清理。影响范围：任务创建失败、图片保存成功但任务未保存、OCR 记录未关联任务的场景。验证：启动后台清理 24 小时以上且未被任务描述或有效 OCR 记录引用的图片文件，并删除对应无任务 `image_texts` 记录；任务创建/删除统一使用本地图片路径解析 helper；`npm run lint` 和 `npm run build` 通过。
- [x] 自定义数据目录切换策略明确。影响范围：设置页数据目录、SQLite 连接、图片目录、重启提示或迁移流程。验证：运行中固定使用启动时的 active data dir，保存新目录只作为下次启动配置；`config:setDataDir` 返回 `requiresRestart/activeDataDir/pendingDataDir`；设置页明确提示重启后生效且当前窗口仍用当前目录；`npm run lint` 和 `npm run build` 通过。
- [x] LLM API Key 安全存储或脱敏。影响范围：配置文件、日志、设置页展示、导出/错误提示。验证：`llm:getConfig` 和 legacy `config:getApiKey` 返回 `********后四位`；保存未改动的脱敏值时保留原密钥，输入新值时更新；`npm run lint` 和 `npm run build` 通过。
- [x] 数据库迁移前自动备份。影响范围：未来 schema migration、索引/字段/表结构升级。验证：数据库初始化前如已有 `tasks.db`，在 `data/backups` 每日最多生成一份备份并保留最近 10 份；`npm run lint` 和 `npm run build` 通过。
- [x] 资源归位与去重。影响范围：根目录 `*.traineddata`、`resources/tessdata`、embedding 模型缓存、打包资源体积。验证：删除根目录重复 `chi_sim.traineddata` / `eng.traineddata`，保留权威位置 `resources/tessdata`；`electron-builder.yml` 仅通过 `extraResources` 携带运行时资源，避免 resources 进 asar 后再重复复制；`npm run lint` 和 `npm run build` 通过。

## 结构重构

- [x] 拆分 `TaskDetail.tsx`。影响范围：任务详情、子任务、历史、活动时间线、图片/OCR 展示。验证：详情查看、编辑、删除、子任务增删改、历史编辑、图片预览需在统一回归项中应用内确认；`npm run lint`、`npm run build` 通过。进展：已复用共享 `ImageOCRInfo` 类型，抽出 `OcrStatus.tsx` 展示组件和 `taskDetailImages.ts` 图片/OCR helper；新增 `TaskImages.tsx` 承载任务描述图片和历史图片 OCR 展示/重试；新增 `SubtasksSection.tsx` 承载子任务列表、进度条、状态切换、编辑/删除入口；新增 `ActivityTimelineSection.tsx` 承载活动时间线、历史编辑/删除入口、历史图片展示；当前 `TaskDetail.tsx` 约 744 行。
- [x] 拆分 `Summary.tsx`。影响范围：统计加载、LLM 总结、Markdown/Word 导出、年度/周度视图。验证：已新增 `summaryUtils.ts`，抽出日期范围/本地日期格式化/摘要任务映射/统计分布补齐工具；新增 `summaryExports.ts`，抽出导出标签、图片标记清理、历史记录格式化和 Markdown 报告生成；新增 `useSummaryData.ts`，承载统计聚合加载、任务分组和错误状态；新增 `summaryWordExports.ts`，承载智能总结 Word、完整总结 Word 和任务数据 Word 的按需 docx 生成；`Summary.tsx` 降至约 919 行；`npm run lint`、`npm run build` 通过。应用内保存对话框、周报/年报生成、日期筛选和导出点击回归继续纳入“图片/OCR/搜索/摘要关键流程回归测试”。
- [x] 统一 IPC contract 类型。影响范围：`electron/preload.ts`、`src/ipc/tasks.ts`、`src/types/index.ts`。验证：前后端 IPC 类型统一到 `ElectronAPI`，`npm run lint`、`npm run build` 通过。
- [x] 引入数据库迁移版本管理。影响范围：数据库初始化和后续 schema 变更。验证：新增 `schema_migrations` baseline 记录，迁移记录写入幂等，`npm run lint`、`npm run build` 通过；旧库实机启动仍需在应用内确认。

## UI/交互优化

- [x] UI 动效、按钮、图标体系统一。影响范围：任务列表、搜索、摘要、设置、弹窗。验证：新增 `UI_INTERACTION_GUIDELINES.md` 固化按钮/动效/反馈规范；设置页新增配置总览，后续新增 UI 有统一约束；`npm run lint`、`npm run build` 通过。
- [x] 设置页信息架构整理。影响范围：LLM 配置、数据目录、更新检查、OCR 日志、日志目录。验证：设置页顶部新增版本、数据目录状态、LLM 配置状态、OCR 日志数量总览；数据目录重启生效提示保留；`npm run lint`、`npm run build` 通过。
- [x] 搜索页交互优化。影响范围：搜索输入、模式切换、日期范围、空状态、错误状态。验证：Enter 搜索改为输入框局部触发，避免弹窗误触；重复搜索使用请求序号避免旧结果覆盖新结果；`npm run lint`、`npm run build` 通过。
- [x] 图片/OCR 状态提示优化。影响范围：任务详情图片 OCR 状态、重试入口、失败原因展示。验证：任务描述图片和历史图片 OCR 重试失败会在界面显示原因，重试按钮使用 `aria-busy` 并避免重复点击；`npm run lint`、`npm run build` 通过。

## 验证与发布

- [ ] 图片/OCR/搜索/摘要关键流程回归测试。影响范围：手动 QA 或后续自动化测试。验证：覆盖图片粘贴、OCR 识别、图片搜索、关键词搜索、混合搜索、LLM 总结、导出。进展：已新增 `REGRESSION_TEST_CHECKLIST.md`；新增 `npm run regression:smoke`，通过 Electron Node 运行时只读检查当前库 integrity/foreign key、任务/历史/OCR 记录、关键词搜索、图片 OCR 搜索、Summary 聚合、源码与打包资源路径，并用临时副本模拟旧库写入 6 条 migration baseline；2026-06-28 `npm run regression:smoke` 通过，22 passed、1 warning、0 failed；`npm run lint` 和 `npm run build` 通过。剩余：需要在应用内逐项点击验证 `npm run electron:dev` 窗口、图片粘贴/预览/OCR 重试、搜索页交互、LLM 周报/年报生成、Markdown/Word 保存对话框和打包后真实 OCR 识别。
- [x] Electron 打包验证。影响范围：`npm run electron:build`、资源路径、模型、OCR 数据、图标。验证：`npm run electron:build` 成功，生成 `release/win-unpacked` 和 `release/Task Manager Setup 1.4.1.exe`；打包后的 `release/win-unpacked/Task Manager.exe` smoke test 启动成功，8 秒内未崩溃并已关闭进程。
- [x] 数据库升级兼容验证。影响范围：已有 `data/tasks.db`、索引创建、未来迁移。验证：新增 `DATABASE_UPGRADE_VERIFICATION.md`；只读检查现有库 integrity ok、外键问题 0、任务/历史/图片 OCR/关键词查询可读；临时副本迁移模拟后 migration 记录 6 条、integrity ok、外键问题 0。
- [x] 性能基准记录。影响范围：任务列表加载、搜索、摘要、图片预览、OCR。验证：新增 `PERFORMANCE_BASELINE.md`，记录当前构建产物大小、大文件行数、已完成性能优化状态和后续手动耗时记录表；`npm run lint`、`npm run build` 通过。
