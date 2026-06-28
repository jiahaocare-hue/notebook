import type { CompletedTask, TaskPriority, TaskStatus } from '../../types'

export type TimeRangeType = 'year' | 'week' | 'custom'

export interface DateRange {
  startDate: string
  endDate: string
}

export function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayDateRange(): DateRange {
  const dateStr = formatDateLocal(new Date())
  return {
    startDate: dateStr,
    endDate: dateStr,
  }
}

export function getWeekDateRange(weekOffset: number = 0): DateRange {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek

  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMonday + (weekOffset * 7))
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  return {
    startDate: formatDateLocal(monday),
    endDate: formatDateLocal(sunday),
  }
}

export interface SummaryTaskRow {
  id: number
  title: string
  description: string | null
  priority: string
  status: string
  due_date?: string | null
  created_at?: string
  updated_at?: string
  history?: {
    action: string
    old_value: string | null
    new_value: string | null
    timestamp: string
  }[]
}

export function toCompletedTask(task: SummaryTaskRow): CompletedTask {
  const history = task.history?.slice(0, 5).map(h => ({
    action: h.action,
    old_value: h.old_value,
    new_value: h.new_value,
    timestamp: h.timestamp,
  }))

  return {
    title: task.title,
    description: task.description,
    priority: task.priority as TaskPriority,
    status: task.status as TaskStatus,
    dueDate: task.due_date,
    createdAt: task.created_at,
    completedAt: task.updated_at,
    history,
  }
}

export function fillSummaryDistribution(
  rawDistribution: { month: string; count: number }[],
  startDate: string,
  endDate: string,
  selectedYear: number,
  isYearRange: boolean
): { month: string; count: number }[] {
  const distributionCounts = new Map(rawDistribution.map(item => [item.month, item.count]))
  const distribution: { month: string; count: number }[] = []

  if (isYearRange) {
    for (let month = 1; month <= 12; month++) {
      const monthStr = String(month).padStart(2, '0')
      const monthKey = `${selectedYear}-${monthStr}`
      distribution.push({
        month: monthKey,
        count: distributionCounts.get(monthKey) || 0,
      })
    }
    return distribution
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

  for (let i = 0; i < days; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const dateStr = formatDateLocal(date)

    distribution.push({
      month: dateStr,
      count: distributionCounts.get(dateStr) || 0,
    })
  }

  return distribution
}
