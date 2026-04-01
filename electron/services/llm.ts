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

const DEFAULT_PROMPT_TEMPLATE = `你是一个任务管理助手，请根据以下任务数据生成一份结构清晰、内容详实的总结报告。

## 时间范围
{{timeRange}}

## 任务统计数据
- 总任务数: {{total}}
- 已完成: {{completed}}
- 进行中: {{inProgress}}
- 待处理: {{pending}}
- 已取消: {{cancelled}}
- 完成率: {{completionRate}}%
{{#avgCompletionTime}}- 平均完成时间: {{avgCompletionTime}} 天{{/avgCompletionTime}}

## 优先级分布
{{priorityDistribution}}

## 已完成任务详情
{{completedTasksList}}

## 进行中任务详情
{{inProgressTasksList}}

## 待处理任务详情
{{pendingTasksList}}

请严格按照以下格式生成总结报告：

### 一、已完成任务（共{{completed}}项）
请详细列出每项已完成任务：
- 任务名称
- 任务描述（如有）
- 完成时间
- 任务成果或关键产出

### 二、未完成任务
#### 1. 进行中任务（共{{inProgress}}项）
请详细列出每项进行中任务：
- 任务名称
- 任务描述（如有）
- 当前进度状态
- 截止日期（如有）
- 预计完成时间

#### 2. 待处理任务（共{{pending}}项）
请详细列出每项待处理任务：
- 任务名称
- 任务描述（如有）
- 优先级
- 截止日期（如有）

### 三、总结与建议
简要总结工作情况，给出改进建议和下一步计划。

报告应采用正式、专业的文档格式，内容准确、条理清晰，便于阅读和理解。请用中文回复。`

function buildPrompt(request: SummaryRequest, customTemplate?: string): string {
  const { stats, completedTasks, timeRange, pendingTasks = [], inProgressTasks = [] } = request

  let timeRangeText = '全部时间'
  if (timeRange) {
    timeRangeText = `${timeRange.startDate} 至 ${timeRange.endDate}`
  }

  const priorityText = Object.entries(stats.priorityDistribution)
    .filter(([, count]) => count > 0)
    .map(([priority, count]) => `- ${priority === 'high' ? '高' : priority === 'medium' ? '中' : '低'}优先级: ${count} 个任务`)
    .join('\n')

  const monthlyText = stats.monthlyDistribution
    .map(m => `- ${m.month}: ${m.count} 个任务`)
    .join('\n')

  const tasksText = completedTasks
    .slice(0, 50)
    .map((task, index) => {
      const priorityLabel = task.priority === 'high' ? '[高]' : task.priority === 'medium' ? '[中]' : '[低]'
      let taskText = `${index + 1}. ${priorityLabel} ${task.title}`
      
      if (task.description) {
        taskText += `\n   描述: ${task.description.substring(0, 200)}${task.description.length > 200 ? '...' : ''}`
      }
      
      if (task.dueDate) {
        taskText += `\n   截止日期: ${task.dueDate}`
      }
      
      if (task.createdAt && task.completedAt) {
        const created = new Date(task.createdAt)
        const completed = new Date(task.completedAt)
        const days = Math.round((completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        taskText += `\n   完成耗时: ${days} 天`
      }
      
      if (task.completedAt) {
        taskText += `\n   完成时间: ${task.completedAt.split('T')[0]}`
      }
      
      if (task.history && task.history.length > 0) {
        const historyText = task.history
          .slice(0, 5)
          .map(h => {
            const actionMap: Record<string, string> = {
              'create': '创建',
              'update': '更新',
              'status_change': '状态变更',
              'priority_change': '优先级变更',
            }
            const actionLabel = actionMap[h.action] || h.action
            return `${actionLabel}: ${h.oldValue || '无'} → ${h.newValue || '无'}`
          })
          .join('; ')
        taskText += `\n   更新记录: ${historyText}`
      }
      
      return taskText
    })
    .join('\n\n')

  const inProgressTasksText = inProgressTasks
    .slice(0, 30)
    .map((task, index) => {
      const priorityLabel = task.priority === 'high' ? '[高]' : task.priority === 'medium' ? '[中]' : '[低]'
      let taskText = `${index + 1}. ${priorityLabel} ${task.title}`
      
      if (task.description) {
        taskText += `\n   描述: ${task.description.substring(0, 200)}${task.description.length > 200 ? '...' : ''}`
      }
      
      if (task.dueDate) {
        taskText += `\n   截止日期: ${task.dueDate}`
      }
      
      return taskText
    })
    .join('\n\n')

  const pendingTasksText = pendingTasks
    .slice(0, 30)
    .map((task, index) => {
      const priorityLabel = task.priority === 'high' ? '[高]' : task.priority === 'medium' ? '[中]' : '[低]'
      let taskText = `${index + 1}. ${priorityLabel} ${task.title}`
      
      if (task.description) {
        taskText += `\n   描述: ${task.description.substring(0, 200)}${task.description.length > 200 ? '...' : ''}`
      }
      
      if (task.dueDate) {
        taskText += `\n   截止日期: ${task.dueDate}`
      }
      
      return taskText
    })
    .join('\n\n')

  const template = customTemplate || DEFAULT_PROMPT_TEMPLATE

  let prompt = template
    .replace(/\{\{timeRange\}\}/g, timeRangeText)
    .replace(/\{\{total\}\}/g, String(stats.total))
    .replace(/\{\{completed\}\}/g, String(stats.completed))
    .replace(/\{\{inProgress\}\}/g, String(stats.inProgress))
    .replace(/\{\{pending\}\}/g, String(stats.pending))
    .replace(/\{\{cancelled\}\}/g, String(stats.cancelled))
    .replace(/\{\{completionRate\}\}/g, (stats.completionRate * 100).toFixed(1))
    .replace(/\{\{priorityDistribution\}\}/g, priorityText)
    .replace(/\{\{monthlyDistribution\}\}/g, monthlyText)
    .replace(/\{\{completedTasksList\}\}/g, tasksText || '无')
    .replace(/\{\{inProgressTasksList\}\}/g, inProgressTasksText || '无')
    .replace(/\{\{pendingTasksList\}\}/g, pendingTasksText || '无')

  if (stats.avgCompletionTime) {
    prompt = prompt.replace(/\{\{avgCompletionTime\}\}/g, stats.avgCompletionTime.toFixed(1))
    prompt = prompt.replace(/\{\{#avgCompletionTime\}\}([\s\S]*?)\{\{\/avgCompletionTime\}\}/g, '$1')
  } else {
    prompt = prompt.replace(/\{\{#avgCompletionTime\}\}[\s\S]*?\{\{\/avgCompletionTime\}\}/g, '')
    prompt = prompt.replace(/\{\{avgCompletionTime\}\}/g, '')
  }

  return prompt
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
    promptTemplate
  } = config

  if (!apiKey) {
    throw new Error('API Key 未配置')
  }

  const prompt = buildPrompt(request, promptTemplate)

  const apiUrl = baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)

  try {
    const fetchOptions: RequestInit & { agent?: unknown } = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    }

    if (!verifySSL) {
      const https = await import('https')
      fetchOptions.agent = new https.Agent({
        rejectUnauthorized: false,
      })
    }

    const response = await fetch(apiUrl, fetchOptions)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LLM API 调用失败: ${response.status} ${errorText}`)
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string
        }
      }>
    }

    return data.choices[0]?.message?.content || '生成总结失败'
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`请求超时（${timeout}秒）`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export { DEFAULT_PROMPT_TEMPLATE }
