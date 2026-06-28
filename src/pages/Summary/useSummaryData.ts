import { useCallback, useEffect, useState } from 'react'
import type { CompletedTask, DateFilterMode, TaskStats } from '../../types'
import { taskApi } from '../../ipc/tasks'
import {
  DateRange,
  TimeRangeType,
  fillSummaryDistribution,
  toCompletedTask,
} from './summaryUtils'

interface UseSummaryDataOptions {
  dateFilterMode: DateFilterMode
  getDateRange: () => DateRange
  selectedYear: number
  timeRangeType: TimeRangeType
}

export function useSummaryData({
  dateFilterMode,
  getDateRange,
  selectedYear,
  timeRangeType,
}: UseSummaryDataOptions) {
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>([])
  const [pendingTasks, setPendingTasks] = useState<CompletedTask[]>([])
  const [inProgressTasks, setInProgressTasks] = useState<CompletedTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatistics = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { startDate, endDate } = getDateRange()
      const bucket = timeRangeType === 'year' ? 'month' : 'day'

      const [rawStats, tasks] = await Promise.all([
        taskApi.getSummaryStats({ startDate, endDate, dateFilterMode, bucket }),
        window.electronAPI.listTasksWithHistory({ startDate, endDate, dateFilterMode }),
      ])

      const completedTasksList = tasks
        .filter(task => task.status === 'completed')
        .map(toCompletedTask)

      const pendingTasksList = tasks
        .filter(task => task.status === 'pending')
        .map(toCompletedTask)

      const inProgressTasksList = tasks
        .filter(task => task.status === 'in_progress')
        .map(toCompletedTask)

      setStats({
        ...rawStats,
        monthlyDistribution: fillSummaryDistribution(
          rawStats.monthlyDistribution,
          startDate,
          endDate,
          selectedYear,
          timeRangeType === 'year'
        ),
      })
      setCompletedTasks(completedTasksList)
      setPendingTasks(pendingTasksList)
      setInProgressTasks(inProgressTasksList)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [dateFilterMode, getDateRange, selectedYear, timeRangeType])

  useEffect(() => {
    loadStatistics()
  }, [loadStatistics])

  return {
    completedTasks,
    error,
    inProgressTasks,
    loading,
    loadStatistics,
    pendingTasks,
    setError,
    stats,
  }
}
