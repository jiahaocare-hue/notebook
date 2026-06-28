import type { CompletedTask, TaskStats } from '../../types'
import type { TimeRangeType } from './summaryUtils'

export const statusLabelMap: Record<string, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

export const priorityLabelMap: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export interface SummaryHistoryEntry {
  action: string
  old_value: string | null
  new_value: string | null
  timestamp: string
}

export const stripImageMarks = (text: string): string => {
  return text
    .replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const formatHistoryEntry = (entry: SummaryHistoryEntry): string => {
  const datePrefix = entry.timestamp.split('T')[0] + ': '

  if (entry.action === 'created') {
    const details: string[] = []
    try {
      const newObj = entry.new_value ? JSON.parse(entry.new_value) : {}
      if (newObj.title) details.push(`标题: ${newObj.title}`)
      if (newObj.status) details.push(`状态: ${statusLabelMap[newObj.status] || newObj.status}`)
      if (newObj.priority) details.push(`优先级: ${priorityLabelMap[newObj.priority] || newObj.priority}`)
      if (newObj.due_date) details.push(`截止日期: ${newObj.due_date}`)
    } catch {
      // Ignore malformed history payloads and fall back to the action label.
    }
    return datePrefix + '创建任务' + (details.length > 0 ? `（${details.join('，')}）` : '')
  }

  if (entry.action === 'status_changed') {
    let oldStatus: string
    let newStatus: string
    try {
      const oldObj = entry.old_value ? JSON.parse(entry.old_value) : {}
      const newObj = entry.new_value ? JSON.parse(entry.new_value) : {}
      oldStatus = statusLabelMap[oldObj.status] || oldObj.status || ''
      newStatus = statusLabelMap[newObj.status] || newObj.status || ''
    } catch {
      oldStatus = entry.old_value || ''
      newStatus = entry.new_value || ''
    }
    return datePrefix + `状态从 '${oldStatus}' 变更为 '${newStatus}'`
  }

  if (entry.action === 'updated') {
    const changes: string[] = []
    try {
      const oldObj = entry.old_value ? JSON.parse(entry.old_value) : {}
      const newObj = entry.new_value ? JSON.parse(entry.new_value) : {}
      const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
      allKeys.forEach(key => {
        if (oldObj[key] !== newObj[key]) {
          const fieldLabels: Record<string, string> = {
            title: '标题',
            description: '描述',
            priority: '优先级',
            status: '状态',
            due_date: '截止日期',
          }
          const label = fieldLabels[key] || key
          if (key === 'description') {
            const oldDesc = oldObj[key] ? stripImageMarks(String(oldObj[key])) : '(空)'
            const newDesc = newObj[key] ? stripImageMarks(String(newObj[key])) : '(空)'
            changes.push(`描述从 '${oldDesc}' 变更为 '${newDesc}'`)
          } else if (key === 'priority') {
            const oldLabel = priorityLabelMap[oldObj[key]] || oldObj[key]
            const newLabel = priorityLabelMap[newObj[key]] || newObj[key]
            changes.push(`${label}从 '${oldLabel}' 变更为 '${newLabel}'`)
          } else if (key === 'status') {
            const oldLabel = statusLabelMap[oldObj[key]] || oldObj[key]
            const newLabel = statusLabelMap[newObj[key]] || newObj[key]
            changes.push(`${label}从 '${oldLabel}' 变更为 '${newLabel}'`)
          } else {
            changes.push(`${label}从 '${oldObj[key]}' 变更为 '${newObj[key]}'`)
          }
        }
      })
    } catch {
      changes.push('任务已更新')
    }
    return datePrefix + (changes.length > 0 ? changes.join('，') : '任务已更新')
  }

  return datePrefix + entry.action
}

export interface SummaryMarkdownOptions {
  startDate: string
  endDate: string
  selectedYear: number
  timeRangeType: TimeRangeType
  stats: TaskStats | null
  completedTasks: CompletedTask[]
  pendingTasks: CompletedTask[]
  inProgressTasks: CompletedTask[]
  summary: string
}

function getCompletionStatus(rate: number): string {
  if (rate >= 70) return '良好'
  if (rate >= 40) return '一般'
  return '需要改进'
}

function getPriorityMarker(priority: CompletedTask['priority']): string {
  if (priority === 'high') return '[高]'
  if (priority === 'medium') return '[中]'
  return '[低]'
}

function appendTaskList(md: string, title: string, tasks: CompletedTask[], showCompletedAt: boolean): string {
  if (tasks.length === 0) return md

  let next = md + `### ${title}（${tasks.length}）\n\n`
  tasks.forEach((task, index) => {
    next += `${index + 1}. ${getPriorityMarker(task.priority)} **${task.title}**\n`
    if (task.description) {
      next += `   - 描述: ${stripImageMarks(task.description)}\n`
    }
    if (showCompletedAt && task.completedAt) {
      next += `   - 完成时间: ${task.completedAt.split('T')[0]}\n`
    }
    if (!showCompletedAt && task.dueDate) {
      next += `   - 截止日期: ${task.dueDate}\n`
    }
  })

  return next + '\n'
}

export function buildSummaryMarkdownContent({
  startDate,
  endDate,
  timeRangeType,
  stats,
  completedTasks,
  pendingTasks,
  inProgressTasks,
  summary,
}: SummaryMarkdownOptions): string {
  const title = timeRangeType === 'week' ? '周度总结报告' : '年度总结报告'

  let md = `# ${title}\n\n`
  md += `**报告周期**：${startDate} 至 ${endDate}\n\n`

  if (stats) {
    md += `## 统计概览\n\n`
    md += `| 指标 | 数值 | 状态 |\n`
    md += `|:---|:---|:---|\n`
    md += `| 任务总数 | ${stats.total} | - |\n`
    md += `| 已完成 | ${stats.completed} | ${getCompletionStatus(stats.completionRate)} |\n`
    md += `| 进行中 | ${stats.inProgress} | - |\n`
    md += `| 待处理 | ${stats.pending} | - |\n`
    md += `| 完成率 | ${stats.completionRate.toFixed(1)}% | ${getCompletionStatus(stats.completionRate)} |\n`
    if (stats.avgCompletionTime !== undefined) {
      md += `| 平均完成时间 | ${stats.avgCompletionTime.toFixed(1)}天 | ${stats.avgCompletionTime <= 3 ? '高效' : stats.avgCompletionTime <= 7 ? '正常' : '较慢'} |\n`
    }
    md += `\n`

    md += `## 优先级分布\n\n`
    md += `| 优先级 | 数量 |\n`
    md += `|:---|:---|\n`
    md += `| 高优先级 | ${stats.priorityDistribution.high} |\n`
    md += `| 中优先级 | ${stats.priorityDistribution.medium} |\n`
    md += `| 低优先级 | ${stats.priorityDistribution.low} |\n\n`

    if (timeRangeType === 'week') {
      md += `## 任务详情\n\n`
      md = appendTaskList(md, '已完成任务', completedTasks, true)
      md = appendTaskList(md, '进行中任务', inProgressTasks, false)
      md = appendTaskList(md, '待处理任务', pendingTasks, false)
    }
  }

  if (summary) {
    md += `## 智能总结\n\n`
    md += summary
    md += `\n`
  }

  md += `\n---\n`
  md += `*报告生成时间: ${new Date().toLocaleString('zh-CN')}*\n`

  return md
}
