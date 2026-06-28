import { normalizeChatCompletionsUrl, postJsonWithElectronNet } from './llmRequest'

export interface LLMConfig {
  apiKey: string
  baseUrl: string
  model?: string
  timeout?: number
  verifySSL?: boolean
  promptTemplate?: string
}

export interface TaskStats {
  total: number
  completed: number
  inProgress: number
  pending: number
  cancelled: number
  completionRate: number
  avgCompletionTime?: number
  priorityDistribution: {
    high: number
    medium: number
    low: number
  }
  monthlyDistribution: { month: string; count: number }[]
}

export interface TaskHistory {
  action: string
  oldValue: string | null
  newValue: string | null
  timestamp: string
}

export interface CompletedTask {
  title: string
  description: string | null
  priority: string
  status: string
  dueDate?: string | null
  createdAt?: string
  completedAt?: string
  history?: TaskHistory[]
}

export interface SummaryRequest {
  stats: TaskStats
  completedTasks: CompletedTask[]
  timeRange?: {
    startDate: string
    endDate: string
  }
  pendingTasks?: CompletedTask[]
  inProgressTasks?: CompletedTask[]
}

const priorityLabels: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const statusLabels: Record<string, string> = {
  completed: '已完成',
  in_progress: '进行中',
  pending: '待处理',
  cancelled: '已取消',
}

const DEFAULT_PROMPT_TEMPLATE = `你是一个任务管理助手。请根据下面的任务数据生成一份结构清晰、事实准确的中文工作总结。

## 时间范围
{{timeRange}}

## 任务统计
- 总任务数: {{total}}
- 已完成: {{completed}}
- 进行中: {{inProgress}}
- 待处理: {{pending}}
- 已取消: {{cancelled}}
- 完成率: {{completionRate}}%
{{avgCompletionTimeLine}}

## 优先级分布
{{priorityDistribution}}

## 已完成任务
{{completedTasksList}}

## 进行中任务
{{inProgressTasksList}}

## 待处理任务
{{pendingTasksList}}

请按以下结构输出：

### 一、已完成工作
列出主要完成项、关键产出和可见进展。

### 二、推进中工作
列出仍在推进的任务、当前状态和下一步。

### 三、待处理与风险
列出待处理任务、风险点和需要关注的事项。

### 四、总结建议
给出简洁复盘和后续建议。

要求：只根据提供的数据，不要编造；如果某一部分没有数据，请明确说明。`

function truncateText(text: string | null | undefined, maxLength = 220): string {
  if (!text) {
    return ''
  }
  const compacted = text
    .replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '')
    .replace(/!\[.*?\]\(app-image:\/\/[^)]+\)/g, '')
    .replace(/!\[.*?\]\(data:image[^)]+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return compacted.length > maxLength ? `${compacted.slice(0, maxLength)}...` : compacted
}

function formatTask(task: CompletedTask, index: number): string {
  const lines = [
    `${index + 1}. [${priorityLabels[task.priority] || task.priority}优先级] ${task.title}`,
    `   状态: ${statusLabels[task.status] || task.status}`,
  ]

  const description = truncateText(task.description)
  if (description) {
    lines.push(`   描述: ${description}`)
  }
  if (task.dueDate) {
    lines.push(`   截止日期: ${task.dueDate}`)
  }
  if (task.completedAt) {
    lines.push(`   完成时间: ${task.completedAt.split('T')[0]}`)
  }

  return lines.join('\n')
}

function formatTaskList(tasks: CompletedTask[] | undefined, limit: number): string {
  if (!tasks || tasks.length === 0) {
    return '无'
  }

  return tasks.slice(0, limit).map(formatTask).join('\n\n')
}

function buildPrompt(request: SummaryRequest, customTemplate?: string): string {
  const { stats, completedTasks, timeRange, pendingTasks = [], inProgressTasks = [] } = request
  const timeRangeText = timeRange ? `${timeRange.startDate} 至 ${timeRange.endDate}` : '全部时间'
  const priorityText = Object.entries(stats.priorityDistribution)
    .filter(([, count]) => count > 0)
    .map(([priority, count]) => `- ${priorityLabels[priority] || priority}优先级: ${count} 个任务`)
    .join('\n') || '无'
  const avgCompletionTimeLine = stats.avgCompletionTime !== undefined
    ? `- 平均完成时间: ${stats.avgCompletionTime.toFixed(1)} 天`
    : ''

  return (customTemplate || DEFAULT_PROMPT_TEMPLATE)
    .replace(/\{\{timeRange\}\}/g, timeRangeText)
    .replace(/\{\{total\}\}/g, String(stats.total))
    .replace(/\{\{completed\}\}/g, String(stats.completed))
    .replace(/\{\{inProgress\}\}/g, String(stats.inProgress))
    .replace(/\{\{pending\}\}/g, String(stats.pending))
    .replace(/\{\{cancelled\}\}/g, String(stats.cancelled))
    .replace(/\{\{completionRate\}\}/g, stats.completionRate.toFixed(1))
    .replace(/\{\{avgCompletionTimeLine\}\}/g, avgCompletionTimeLine)
    .replace(/\{\{priorityDistribution\}\}/g, priorityText)
    .replace(/\{\{completedTasksList\}\}/g, formatTaskList(completedTasks, 50))
    .replace(/\{\{inProgressTasksList\}\}/g, formatTaskList(inProgressTasks, 30))
    .replace(/\{\{pendingTasksList\}\}/g, formatTaskList(pendingTasks, 30))
}

export async function generateSummary(
  config: LLMConfig,
  request: SummaryRequest
): Promise<string> {
  const {
    apiKey,
    baseUrl,
    model = 'gpt-3.5-turbo',
    timeout = 30,
    verifySSL = true,
    promptTemplate,
  } = config

  if (!apiKey) {
    throw new Error('API Key 未配置')
  }
  if (!baseUrl) {
    throw new Error('Base URL 未配置')
  }

  const response = await postJsonWithElectronNet<{
    choices: Array<{
      message: {
        content: string
      }
    }>
  }>(normalizeChatCompletionsUrl(baseUrl), {
    apiKey,
    timeout,
    verifySSL,
    body: {
      model,
      messages: [
        {
          role: 'user',
          content: buildPrompt(request, promptTemplate),
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    },
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`LLM API 调用失败: ${response.statusCode} ${response.bodyText}`)
  }

  return response.data.choices[0]?.message?.content || '生成总结失败'
}

export { DEFAULT_PROMPT_TEMPLATE }

