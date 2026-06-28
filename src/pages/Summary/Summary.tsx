import React, { useState, useCallback, useMemo } from 'react'
import { SummaryRequest, DateFilterMode } from '../../types'
import { llmApi } from '../../ipc/tasks'
import { DateRange, TimeRangeType, getTodayDateRange, getWeekDateRange } from './summaryUtils'
import { buildSummaryMarkdownContent, formatHistoryEntry, priorityLabelMap, statusLabelMap, stripImageMarks } from './summaryExports'
import { buildGeneratedSummaryWordContent, buildSummaryReportWordContent, buildTaskDataWordContent } from './summaryWordExports'
import { useSummaryData } from './useSummaryData'

const Summary: React.FC = () => {
  const [timeRangeType, setTimeRangeType] = useState<TimeRangeType>('week')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [weekOffset, setWeekOffset] = useState(-1)
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('created')
  const [customDateRange, setCustomDateRange] = useState<DateRange>(() => getTodayDateRange())
  
  const [generating, setGenerating] = useState(false)
  const [exportingTaskData, setExportingTaskData] = useState(false)
  const [summary, setSummary] = useState<string>('')

  const getDateRange = useCallback((): DateRange => {
    if (timeRangeType === 'year') {
      return {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
      }
    } else if (timeRangeType === 'week') {
      return getWeekDateRange(weekOffset)
    }
    return customDateRange
  }, [timeRangeType, selectedYear, customDateRange, weekOffset])

  const {
    completedTasks,
    error,
    inProgressTasks,
    loading,
    loadStatistics,
    pendingTasks,
    setError,
    stats,
  } = useSummaryData({
    dateFilterMode,
    getDateRange,
    selectedYear,
    timeRangeType,
  })

  const handleGenerateSummary = async () => {
    if (!stats) return
    
    setGenerating(true)
    setError(null)
    
    try {
      const { startDate, endDate } = getDateRange()
      const request: SummaryRequest = {
        stats,
        completedTasks,
        timeRange: { startDate, endDate },
        summaryType: timeRangeType === 'week' ? 'weekly' : 'yearly',
        pendingTasks,
        inProgressTasks,
      }
      
      const result = await llmApi.generateSummary(request)
      
      if (result.success && result.summary) {
        setSummary(result.summary)
      } else {
        setError(result.error || '生成总结失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成总结失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleExportSummaryMarkdown = async () => {
    if (!summary) return
    
    try {
      const { startDate, endDate } = getDateRange()
      const title = timeRangeType === 'week' ? '周度工作总结' : '年度工作总结'
      
      let content = `# ${title}\n\n`
      content += `**报告周期**：${startDate} 至 ${endDate}\n\n`
      content += `---\n\n`
      content += summary
      content += `\n\n---\n`
      content += `*生成时间: ${new Date().toLocaleString('zh-CN')}*\n`
      
      const fileName = timeRangeType === 'week' 
        ? `周度工作总结_${startDate}_${endDate}.md`
        : `年度工作总结_${selectedYear}.md`
      
      const result = await window.electronAPI.saveFile({
        defaultPath: fileName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        content,
      })
      
      if (result.success) {
        alert(`文件已保存到: ${result.filePath}`)
      } else if (!result.cancelled) {
        setError(result.error || '保存文件失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    }
  }

  const handleExportSummaryWord = async () => {
    if (!summary) return
    
    try {
      const { startDate, endDate } = getDateRange()
      const content = await buildGeneratedSummaryWordContent({
        endDate,
        selectedYear,
        startDate,
        summary,
        timeRangeType,
      })

      const fileName = timeRangeType === 'week'
        ? `周度工作总结_${startDate}_${endDate}.docx`
        : `年度工作总结_${selectedYear}.docx`

      const result = await window.electronAPI.saveBinaryFile({
        defaultPath: fileName,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
        content,
      })
      
      if (result.success) {
        alert(`文件已保存到: ${result.filePath}`)
      } else if (!result.cancelled) {
        setError(result.error || '保存文件失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    }
  }

  const generateMarkdownContent = (): string => {
    const { startDate, endDate } = getDateRange()
    return buildSummaryMarkdownContent({
      startDate,
      endDate,
      selectedYear,
      timeRangeType,
      stats,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      summary,
    })
  }

  const handleExportMarkdown = async () => {
    try {
      const content = generateMarkdownContent()
      const { startDate, endDate } = getDateRange()
      const fileName = timeRangeType === 'week' 
        ? `周度总结_${startDate}_${endDate}.md`
        : `年度总结_${selectedYear}.md`
      
      const result = await window.electronAPI.saveFile({
        defaultPath: fileName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        content,
      })
      
      if (result.success) {
        alert(`文件已保存到: ${result.filePath}`)
      } else if (result.cancelled) {
        // 用户取消
      } else {
        setError(result.error || '保存文件失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    }
  }

  const handleExportWord = async () => {
    try {
      const { startDate, endDate } = getDateRange()
      const content = await buildSummaryReportWordContent({
        completedTasks,
        endDate,
        inProgressTasks,
        pendingTasks,
        selectedYear,
        startDate,
        stats,
        summary,
        timeRangeType,
      })

      const fileName = timeRangeType === 'week'
        ? `周度总结_${startDate}_${endDate}.docx`
        : `年度总结_${selectedYear}.docx`

      const result = await window.electronAPI.saveBinaryFile({
        defaultPath: fileName,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
        content,
      })
      
      if (result.success) {
        alert(`文件已保存到: ${result.filePath}`)
      } else if (result.cancelled) {
        // 用户取消
      } else {
        setError(result.error || '保存文件失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    }
  }

  const handleExportTaskDataMarkdown = async () => {
    setExportingTaskData(true)
    setError(null)

    try {
      const { startDate, endDate } = getDateRange()
      const tasks = await window.electronAPI.listTasksWithHistory({ startDate, endDate, dateFilterMode })

      if (tasks.length === 0) {
        setError('该时间范围内没有任务数据')
        return
      }

      let content = `# 任务数据导出\n\n`
      content += `**时间范围**：${startDate} 至 ${endDate}\n\n`
      const filterModeLabel = dateFilterMode === 'updated' ? '更新时间' : dateFilterMode === 'created_or_updated' ? '创建或更新时间' : '创建时间'
      content += `**筛选模式**：${filterModeLabel}\n\n`
      content += `---\n\n`

      tasks.forEach((task, index) => {
        content += `## ${index + 1}. ${task.title}\n\n`
        content += `- **创建时间**：${task.created_at.split('T')[0]}\n`
        content += `- **优先级**：${priorityLabelMap[task.priority] || task.priority}\n`
        content += `- **状态**：${statusLabelMap[task.status] || task.status}\n`
        content += `- **截止日期**：${task.due_date || '无'}\n\n`

        if (task.description) {
          content += `**描述**：\n${stripImageMarks(task.description)}\n\n`
        }

        if (task.history && task.history.length > 0) {
          content += `**变更历史**：\n`
          task.history.forEach(h => {
            content += `- ${formatHistoryEntry(h)}\n`
          })
          content += `\n`
        }

        content += `---\n\n`
      })

      content += `*导出时间: ${new Date().toLocaleString('zh-CN')}*\n`

      const result = await window.electronAPI.saveFile({
        defaultPath: `任务数据_${startDate}_${endDate}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        content,
      })

      if (result.success) {
        alert(`文件已保存到: ${result.filePath}`)
      } else if (!result.cancelled) {
        setError(result.error || '保存文件失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    } finally {
      setExportingTaskData(false)
    }
  }

  const handleExportTaskDataWord = async () => {
    setExportingTaskData(true)
    setError(null)

    try {
      const { startDate, endDate } = getDateRange()
      const tasks = await window.electronAPI.listTasksWithHistory({ startDate, endDate, dateFilterMode })

      if (tasks.length === 0) {
        setError('该时间范围内没有任务数据')
        return
      }

      const content = await buildTaskDataWordContent({
        dateFilterMode,
        endDate,
        startDate,
        tasks,
      })

      const result = await window.electronAPI.saveBinaryFile({
        defaultPath: `任务数据_${startDate}_${endDate}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
        content,
      })

      if (result.success) {
        alert(`文件已保存到: ${result.filePath}`)
      } else if (!result.cancelled) {
        setError(result.error || '保存文件失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    } finally {
      setExportingTaskData(false)
    }
  }

  const renderMarkdown = (text: string): React.ReactNode => {
    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    
    lines.forEach((line, index) => {
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={index} className="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-4 mb-2">
            {line.substring(4)}
          </h3>
        )
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={index} className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-6 mb-3">
            {line.substring(3)}
          </h2>
        )
      } else if (line.startsWith('# ')) {
        elements.push(
          <h1 key={index} className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-6 mb-4">
            {line.substring(2)}
          </h1>
        )
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <li key={index} className="ml-4 text-gray-700 dark:text-gray-300 mb-1">
            {line.substring(2)}
          </li>
        )
      } else if (line.match(/^\d+\.\s/)) {
        const content = line.replace(/^\d+\.\s/, '')
        elements.push(
          <li key={index} className="ml-4 text-gray-700 dark:text-gray-300 mb-1 list-decimal">
            {content}
          </li>
        )
      } else if (line.trim() === '') {
        elements.push(<br key={index} />)
      } else {
        elements.push(
          <p key={index} className="text-gray-700 dark:text-gray-300 mb-2">
            {line}
          </p>
        )
      }
    })
    
    return elements
  }

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const years = []
    for (let year = currentYear; year >= currentYear - 10; year--) {
      years.push(year)
    }
    return years
  }, [])

  const getStatusBadge = (rate: number): { color: string; text: string } => {
    if (rate >= 70) return { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', text: '✅ 达标' }
    if (rate >= 40) return { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', text: '⚠️ 偏低' }
    return { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', text: '❌ 极低' }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {timeRangeType === 'week' ? '上周总结' : timeRangeType === 'year' ? '年度总结' : '自定义总结'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {timeRangeType === 'week' 
              ? '查看上周任务统计，为周例会做准备' 
              : '查看任务统计和生成智能总结'}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">时间范围</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTimeRangeType('week'); setWeekOffset(-1); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRangeType === 'week'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
              }`}>
              上周
            </button>
            <button
              onClick={() => setTimeRangeType('year')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRangeType === 'year'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
              }`}>
              年度
            </button>
            <button
              onClick={() => setTimeRangeType('custom')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRangeType === 'custom'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
              }`}>
              自定义
            </button>
          </div>

          <span className="text-sm font-medium text-gray-600 dark:text-gray-400 ml-2">筛选模式</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDateFilterMode('created')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                dateFilterMode === 'created'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
              }`}>
              创建时间
            </button>
            <button
              onClick={() => setDateFilterMode('updated')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                dateFilterMode === 'updated'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
              }`}>
              更新时间
            </button>
            <button
              onClick={() => setDateFilterMode('created_or_updated')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                dateFilterMode === 'created_or_updated'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
              }`}>
              创建或更新
            </button>
          </div>

          {timeRangeType === 'year' ? (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
            >
              {yearOptions.map(year => (
                <option key={year} value={year}>{year} 年</option>
              ))}
            </select>
          ) : timeRangeType === 'week' ? null : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customDateRange.startDate}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
              />
              <span className="text-gray-400 dark:text-gray-500">至</span>
              <input
                type="date"
                value={customDateRange.endDate}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
              />
            </div>
          )}
          
          <button
            onClick={loadStatistics}
            disabled={loading}
            className="px-5 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {loading ? '加载中...' : '查询'}
          </button>
          
          {stats && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleExportMarkdown}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm font-medium dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                导出 Markdown
              </button>
              <button
                onClick={handleExportWord}
                className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-all text-sm font-medium dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                导出 Word
              </button>

              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>

              <button
                onClick={handleExportTaskDataMarkdown}
                disabled={!stats || stats.total === 0 || exportingTaskData}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingTaskData ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-700"></div>
                    导出中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    导出任务 MD
                  </>
                )}
              </button>
              <button
                onClick={handleExportTaskDataWord}
                disabled={!stats || stats.total === 0 || exportingTaskData}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingTaskData ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-700"></div>
                    导出中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    导出任务 Word
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-500 dark:text-gray-400 mt-4">加载统计数据中...</p>
        </div>
      ) : stats ? (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              统计概览
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                ({getDateRange().startDate} 至 {getDateRange().endDate})
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">指标</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">数值</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">任务总数</td>
                    <td className="py-3 px-4 text-center font-semibold text-gray-900 dark:text-gray-100">{stats.total}</td>
                    <td className="py-3 px-4 text-center text-gray-400 dark:text-gray-500">-</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">已完成</td>
                    <td className="py-3 px-4 text-center font-semibold text-emerald-600 dark:text-emerald-400">{stats.completed}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(stats.completionRate).color}`}>
                        {getStatusBadge(stats.completionRate).text}
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">进行中</td>
                    <td className="py-3 px-4 text-center font-semibold text-amber-600 dark:text-amber-400">{stats.inProgress}</td>
                    <td className="py-3 px-4 text-center text-gray-400 dark:text-gray-500">-</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">待处理</td>
                    <td className="py-3 px-4 text-center font-semibold text-blue-600 dark:text-blue-400">{stats.pending}</td>
                    <td className="py-3 px-4 text-center text-gray-400 dark:text-gray-500">-</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">完成率</td>
                    <td className="py-3 px-4 text-center font-semibold text-gray-900 dark:text-gray-100">{stats.completionRate.toFixed(1)}%</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(stats.completionRate).color}`}>
                        {getStatusBadge(stats.completionRate).text}
                      </span>
                    </td>
                  </tr>
                  {stats.avgCompletionTime !== undefined && (
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="py-3 px-4 text-gray-700 dark:text-gray-300">平均完成时间</td>
                      <td className="py-3 px-4 text-center font-semibold text-gray-900 dark:text-gray-100">{stats.avgCompletionTime.toFixed(1)}天</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          stats.avgCompletionTime <= 3 
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                            : stats.avgCompletionTime <= 7 
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {stats.avgCompletionTime <= 3 ? '✅ 高效' : stats.avgCompletionTime <= 7 ? '⚠️ 正常' : '❌ 较慢'}
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {timeRangeType === 'week' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {completedTasks.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                  <h3 className="text-lg font-semibold text-emerald-600 mb-3">
                    ✅ 已完成 ({completedTasks.length})
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {completedTasks.map((task, index) => (
                      <div key={index} className="flex items-start gap-2 p-2 bg-emerald-50 rounded-lg">
                        <span className="text-sm">
                          {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                          {task.completedAt && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{task.completedAt.split('T')[0]}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {inProgressTasks.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                  <h3 className="text-lg font-semibold text-amber-600 mb-3">
                    🔄 进行中 ({inProgressTasks.length})
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {inProgressTasks.map((task, index) => (
                      <div key={index} className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <span className="text-sm">
                          {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                          {task.dueDate && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">截止: {task.dueDate}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {pendingTasks.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                  <h3 className="text-lg font-semibold text-blue-600 mb-3">
                    📋 待处理 ({pendingTasks.length})
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {pendingTasks.map((task, index) => (
                      <div key={index} className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
                        <span className="text-sm">
                          {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                          {task.dueDate && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">截止: {task.dueDate}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {timeRangeType === 'year' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">状态分布</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">待处理</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.pending / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{stats.pending}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">进行中</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-amber-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.inProgress / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{stats.inProgress}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">已完成</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-emerald-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{stats.completed}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">已取消</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-gray-400 h-2 rounded-full dark:bg-gray-500" 
                            style={{ width: `${stats.total > 0 ? (stats.cancelled / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{stats.cancelled}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">优先级分布</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">高优先级</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-red-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.priorityDistribution.high / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{stats.priorityDistribution.high}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">中优先级</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-yellow-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.priorityDistribution.medium / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{stats.priorityDistribution.medium}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">低优先级</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.priorityDistribution.low / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{stats.priorityDistribution.low}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">月度任务分布</h3>
                <div className="flex items-end gap-2 h-40">
                  {stats.monthlyDistribution.map((item, index) => {
                    const maxCount = Math.max(...stats.monthlyDistribution.map(m => m.count), 1)
                    const height = (item.count / maxCount) * 100
                    return (
                      <div key={index} className="flex-1 flex flex-col items-center">
                        <div className="w-full flex flex-col items-center justify-end h-32">
                          <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">{item.count}</span>
                          <div 
                            className="w-full bg-blue-500 rounded-t transition-all duration-300"
                            style={{ height: `${height}%`, minHeight: item.count > 0 ? '4px' : '0' }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-2">{index + 1}月</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">智能总结</h3>
              <div className="flex items-center gap-2">
                {summary && (
                  <>
                    <button
                      onClick={handleExportSummaryMarkdown}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm font-medium dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      导出 Markdown
                    </button>
                    <button
                      onClick={handleExportSummaryWord}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-all text-sm font-medium dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      导出 Word
                    </button>
                  </>
                )}
                <button
                  onClick={handleGenerateSummary}
                  disabled={generating || stats.total === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {generating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      生成中...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      生成总结
                    </>
                  )}
                </button>
              </div>
            </div>

            {summary ? (
              <div className="prose max-w-none bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                {renderMarkdown(summary)}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 mb-2">点击上方按钮生成智能总结</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">需要配置 LLM API Key 才能使用此功能</p>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default Summary
