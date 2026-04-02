# Task Manager

一个功能丰富的桌面任务管理应用，基于 Electron + React + TypeScript + Vite 构建，支持智能搜索、图片 OCR、语义搜索和 LLM 摘要生成。

<img width="1482" height="953" alt="Snipaste_2026-04-03_00-01-05" src="https://github.com/user-attachments/assets/658c1f46-8b4a-4a8b-8b80-40d2a97f8757" />

安装包下载地址：
https://github.com/jiahaocare-hue/notebook/releases

## 功能特性

### 任务管理
- 创建、编辑、删除任务
- 任务状态管理：待处理、进行中、已完成、已取消
- 任务优先级设置：低、中、高
- 任务历史记录追踪
- 截止日期设置

### 智能搜索
- **关键词搜索**：在任务标题和描述中搜索关键词
- **语义搜索**：基于嵌入向量的智能语义匹配，理解搜索意图
- **混合搜索**：结合关键词和语义搜索，提供更精准的结果
- **图片内容搜索**：通过 OCR 识别图片中的文字进行搜索

### 图片管理
- 任务中添加图片
- 图片本地存储
- 自动 OCR 文字识别（支持中英文）
- 图片内容可搜索

### 日历视图
- 按日期查看任务
- 日历导航
- 今日/本周/历史任务筛选

### LLM 集成
- 支持自定义 LLM API 配置
- 任务摘要自动生成
- 支持多种 LLM 服务商

### 其他特性
- 自动更新检查
- 自定义数据存储位置
- 响应式界面设计
- 深色/浅色主题

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18 |
| 桌面框架 | Electron 28 |
| 构建工具 | Vite 5 |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS |
| 数据库 | SQLite (better-sqlite3) |
| 嵌入模型 | @xenova/transformers |
| OCR | Tesseract.js |
| 图像处理 | Sharp |
| 自动更新 | electron-updater |

## 安装

### 环境要求
- Node.js 18+
- npm 9+
- Windows / macOS / Linux

### 开发环境设置

1. 克隆仓库
```bash
git clone https://github.com/your-username/task-manager.git
cd task-manager
```

2. 安装依赖
```bash
npm install
```

3. 启动开发服务器
```bash
npm run electron:dev
```

应用将自动启动开发服务器和 Electron 窗口。

## 使用说明

### 创建任务
1. 点击界面上的"新建任务"按钮
2. 输入任务标题和描述
3. 设置优先级和截止日期（可选）
4. 添加图片（可选）
5. 点击保存

### 搜索任务
1. 点击搜索图标或使用快捷键
2. 选择搜索模式：
   - **关键词**：精确匹配标题和描述
   - **混合**：结合关键词和语义理解
   - **图片**：搜索图片中的文字内容
3. 输入搜索内容，结果实时显示

### 查看日历
1. 点击侧边栏的"日历"选项
2. 选择日期查看当天任务
3. 使用日历导航切换月份

### 生成摘要
1. 进入"摘要"页面
2. 选择时间范围
3. 点击生成摘要（需先配置 LLM）

## 配置说明

### LLM 配置

要使用摘要生成功能，需要配置 LLM API：

1. 点击设置图标
2. 找到 LLM 配置部分
3. 填写以下信息：
   - **API Key**：你的 LLM API 密钥
   - **Base URL**：API 端点地址
   - **Model**：模型名称（可选）
   - **Timeout**：请求超时时间（默认 30 秒）
   - **Verify SSL**：是否验证 SSL 证书

支持的 LLM 服务商示例：
- OpenAI
- Azure OpenAI
- 本地部署的 LLM 服务
- 其他兼容 OpenAI API 的服务

### 数据存储配置

默认情况下，数据存储在应用的用户数据目录：
- Windows: `%APPDATA%/task-manager/data`
- macOS: `~/Library/Application Support/task-manager/data`
- Linux: `~/.config/task-manager/data`

可以自定义数据存储位置：
1. 点击设置图标
2. 找到数据目录配置
3. 选择新的存储位置
4. 重启应用生效

### 数据库结构

应用使用 SQLite 数据库，包含以下表：
- `tasks`：任务数据
- `task_history`：任务变更历史
- `task_embeddings`：任务嵌入向量（用于语义搜索）
- `image_texts`：图片 OCR 文字内容

## 构建和发布

### 构建应用
```bash
npm run build
```

### 打包发布
```bash
npm run electron:build
```

打包后的安装包位于 `release` 目录。

### 支持的平台
- Windows: NSIS 安装程序 (x64)
- macOS: DMG
- Linux: AppImage

## 项目结构

```
task-manager/
├── electron/                 # Electron 主进程
│   ├── main.ts              # 主进程入口
│   ├── preload.ts           # 预加载脚本
│   └── services/            # 后端服务
│       ├── embedding.ts     # 嵌入向量服务
│       ├── ocr.ts           # OCR 服务
│       └── llm.ts           # LLM 服务
├── src/                     # 前端源码
│   ├── components/          # React 组件
│   ├── pages/               # 页面组件
│   ├── context/             # React Context
│   ├── ipc/                 # IPC 通信
│   ├── types/               # TypeScript 类型
│   └── utils/               # 工具函数
├── data/                    # 数据目录（运行时创建）
│   ├── tasks.db             # SQLite 数据库
│   └── images/              # 图片存储
└── dist-electron/           # 编译后的 Electron 代码
```

## 开发

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 构建前端和 Electron 代码 |
| `npm run electron:dev` | 启动开发模式（前端 + Electron） |
| `npm run electron:build` | 打包应用 |
| `npm run lint` | 代码检查 |

### IPC 通信 API

主进程暴露的 IPC 接口：

```typescript
// 任务操作
window.electronAPI.task.create(task)
window.electronAPI.task.update(id, task)
window.electronAPI.task.delete(id)
window.electronAPI.task.get(id)
window.electronAPI.task.list(filters)

// 搜索
window.electronAPI.search.keyword(query, options)
window.electronAPI.search.semantic(query, options)
window.electronAPI.search.hybrid(query, options)
window.electronAPI.search.image(query, options)

// 图片操作
window.electronAPI.image.save(imageData, fileName, taskId)
window.electronAPI.image.load(imagePath)
window.electronAPI.image.delete(imagePath)

// 配置
window.electronAPI.config.get()
window.electronAPI.config.setDataDir(path)

// LLM
window.electronAPI.llm.getConfig()
window.electronAPI.llm.setConfig(config)
window.electronAPI.llm.generateSummary(request)
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
