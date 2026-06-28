# 任务问答助手实施步骤

## 目标

新增一个一级页面“问答助手”。用户输入自然语言问题后，系统从任务标题、描述、历史记录、图片 OCR 文本中检索证据，调用已有 LLM 配置生成回答，并在右侧展示可点击的证据来源。

## MVP 范围

- 新增问答助手页面和侧边栏入口。
- 支持任务、历史、OCR 三类证据来源。
- 支持全部、本周、本月、自定义日期范围。
- 支持状态筛选。
- 复用已有 LLM 配置，不新增独立 API Key。
- 答案旁展示证据来源，点击证据打开任务详情。
- 未配置 LLM 或检索不到证据时给出清晰提示。

## 非 MVP 范围

- 不保存多轮对话历史。
- 不做复杂引用高亮。
- 不自动创建任务。
- 不新增数据库表。
- 不做任务关系图。

## 实施步骤

1. [x] 梳理现有能力
   - 确认关键词搜索已经覆盖 `task_history.old_value/new_value`。
   - 复用现有 `image_texts` OCR 数据。
   - 复用现有 LLM 配置读取与请求方式。

2. [x] 后端证据检索
   - 新增问答检索服务。
   - 根据问题拆出关键词和短语。
   - 分别查询任务、历史、OCR。
   - 按命中分数、时间和来源合并排序。
   - 限制证据数量，避免 prompt 过长。
   - 泛问题没有关键词命中时，按问题中的“今天/本周/本月”等时间表达拉取近期历史和任务更新作为兜底证据。

3. [x] 后端问答 IPC
   - 新增 `ask:tasks` IPC。
   - 输入 `question/scope`。
   - 输出 `success/answer/evidences/error`。
   - 未配置 LLM 时返回错误和证据。

4. [x] 前端 API 与类型
   - 在 `src/types/index.ts` 新增问答请求、证据、结果类型。
   - 在 `electron/preload.ts` 暴露 `askTasks`。
   - 在 `src/ipc/tasks.ts` 新增 `askApi.askTasks`。

5. [x] 前端页面
   - 新增 `src/pages/Ask/Ask.tsx`。
   - 中间为问答流，底部为输入框和快捷问题。
   - 右侧为证据面板。
   - 顶部提供范围、状态、来源筛选。

6. [x] 导航接入
   - `src/App.tsx` 新增 `ask` 页面。
   - `src/components/Layout/Sidebar.tsx` 新增“问答助手”入口。

7. [x] 验证
   - 运行 `npm run lint`。
   - 运行 `npm run build`。
   - 手动检查问答页面、证据展示、任务详情打开、未配置 LLM 提示。

## 当前结果

- `npm run lint` 通过。
- `npm run build` 通过。
- 构建时仍有 Vite CJS Node API deprecation 警告，属于现有构建工具提示。
- 应用内交互仍建议在 Electron 窗口中手动检查一次。
