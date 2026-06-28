# Performance Baseline

记录日期：2026-06-17

本文档记录当前优化后的性能基准，后续继续做搜索、摘要、图片/OCR、UI 拆分时，用这里的数据做对比。

## 构建验证

- 验证命令：`npm run lint`
- 结果：通过
- 验证命令：`npm run build`
- 结果：通过
- 备注：仍有 Vite CJS Node API deprecation warning，不影响当前构建产物。

## 前端构建产物

来自最近一次 `npm run build` 后的 `dist/assets`：

| 文件 | 大小 |
| --- | ---: |
| `index-CMg8Qut1.js` | 6.0 KB |
| `index-Bktv4nXC.js` | 7.7 KB |
| `index-BjgJMzFP.js` | 39.9 KB |
| `index-CnVHeKMM.js` | 241.2 KB |
| `index-CppOCefa.js` | 397.6 KB |
| `index-D7I66bzD.css` | 45.6 KB |

当前状态：

- `Search`、`Calendar`、`Summary` 已使用页面级 lazy load。
- `docx` 已改为 Word 导出时动态加载。
- 图片预览已改为 `app-image://local/<encoded-path>`，不再通过 IPC 返回 base64。

## 代码体积观察

当前仍偏大的文件：

| 文件 | 行数 |
| --- | ---: |
| `electron/main.ts` | 584 |
| `src/pages/Summary/Summary.tsx` | 919 |
| `src/pages/Summary/summaryWordExports.ts` | 426 |
| `src/components/TaskDetail/TaskDetail.tsx` | 747 |

后续建议：

- 继续在应用内记录 Summary 页面加载和导出耗时。
- 后续可继续把 `Summary.tsx` 的视图区拆成展示组件。
- 手工回归通过后补充图片/OCR、搜索、摘要流程的体感耗时。

## 后续手动基准

建议在应用内记录以下耗时：

| 流程 | 记录方式 | 当前记录 |
| --- | --- | --- |
| 任务列表首屏加载 | 打开应用后首次进入任务列表，记录体感或 DevTools 时间 | 待测 |
| 关键词搜索 | 搜索常用词，记录结果出现时间 | 待测 |
| 混合搜索 | 搜索常用词，记录结果出现时间和失败率 | 待测 |
| 摘要页加载 | 进入 Summary，记录统计和明细出现时间 | 待测 |
| 图片预览 | 打开含图片任务，记录首张图片显示时间 | 待测 |
| OCR 重试 | 对一张图片执行 OCR，记录完成时间 | 待测 |
