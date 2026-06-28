# Regression Test Checklist

记录日期：2026-06-28

每次完成图片、OCR、搜索、摘要、导出、数据库迁移相关改动后，按本清单做一次回归。自动验证先跑，手动验证用当前应用数据执行。

## 自动验证

- [x] `npm run lint`。验证：2026-06-28 通过，0 error、0 warning。
- [x] `npm run build`。验证：2026-06-28 通过。
- [x] 数据库只读检查：`PRAGMA integrity_check = ok`。验证：2026-06-28 `npm run regression:smoke` 返回 ok。
- [x] 数据库只读检查：`PRAGMA foreign_key_check` 返回 0 条。验证：2026-06-28 `npm run regression:smoke` 返回 0 条。
- [x] `npm run regression:smoke`。验证：2026-06-28 通过，22 passed、1 warning、0 failed；warning 为当前 `data/tasks.db` 尚未由新版应用写入 `schema_migrations`，脚本已用临时副本完成旧库迁移模拟。

## 图片与 OCR

- [ ] 在任务详情粘贴一张图片，保存后图片能显示。
- [ ] 关闭并重新打开任务详情，图片仍能显示。
- [ ] 点击图片能打开大图预览。
- [ ] OCR 成功时展示识别状态、时间和文本摘要。
- [ ] OCR 失败时展示失败状态和错误原因。
- [ ] 点击重新识别时按钮进入 busy 状态，完成后刷新状态。
- [ ] 历史记录中的新增图片能预览，并能触发重新识别。

## 搜索

- [x] 关键词搜索能找到标题匹配的任务。验证：2026-06-28 `npm run regression:smoke` 数据层检查通过，样本 `task_id=79`。
- [x] 关键词搜索能找到描述或历史内容匹配的任务。验证：2026-06-28 `npm run regression:smoke` 数据层检查通过，样本 `task_id=81`。
- [x] 图片搜索能找到 OCR 文本匹配的任务。验证：2026-06-28 `npm run regression:smoke` 数据层检查通过，样本 `task_id=73`。
- [ ] 混合搜索失败时页面展示错误，不保留旧结果。
- [ ] 连续快速搜索时，后一次结果不会被前一次慢请求覆盖。
- [ ] 在搜索输入框按 Enter 会搜索；在弹窗内按 Enter 不会误触发搜索页搜索。

## 摘要与导出

- [ ] Summary 页面统计能加载。
- [ ] 日期范围筛选后统计和任务明细同步变化。
- [ ] 周报生成可用。
- [ ] 年报生成可用。
- [ ] Markdown 导出可保存。
- [ ] Word 导出可保存。

## 数据库升级

- [x] 旧 `data/tasks.db` 启动后任务列表可读。验证：2026-06-28 `npm run regression:smoke` 只读检查当前库 61 个任务、顶层任务列表查询可读。
- [x] 旧库启动后图片、历史、OCR 记录可读。验证：2026-06-28 `npm run regression:smoke` 检查历史记录 221 条、OCR 图片文本 89 条、OCR 日志 91 条，样本图片文件存在。
- [x] `schema_migrations` 存在，并记录当前 baseline。验证：2026-06-28 `npm run regression:smoke` 使用临时副本模拟旧库升级，写入 6 条 baseline migration，integrity ok、外键问题 0；当前真实 `data/tasks.db` 仍需在应用启动后写入。
- [ ] 启动后没有外键错误日志。

## 发布前

- [ ] `npm run electron:dev` 可打开窗口。
- [x] `npm run electron:build` 可完成打包。验证：2026-06-18 提升权限后通过，生成 `release/win-unpacked` 和 NSIS 安装包。
- [x] 打包后的应用能启动。验证：2026-06-18 启动 `release/win-unpacked/Task Manager.exe`，8 秒内未自行退出，测试后已关闭进程。
- [x] 打包后的应用能读取 `resources/tessdata` OCR 资源。验证：2026-06-28 `npm run regression:smoke` 确认源码资源和 `release/win-unpacked/resources/resources/tessdata` 中 `chi_sim.traineddata`、`eng.traineddata` 存在，并与当前 packaged path 约定一致。
