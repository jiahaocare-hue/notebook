import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { TaskStats, CompletedTask, SummaryRequest, TaskPriority, TaskStatus } from '../../types'
import { llmApi } from '../../ipc/tasks'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel } from 'docx'

type TimeRangeType = 'year' | 'week' | 'custom'

interface DateRange {
  startDate: string
  endDate: string
}

const getWeekDateRange = (weekOffset: number = 0): DateRange => {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  
  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMonday + (weekOffset * 7))
  monday.setHours(0, 0, 0, 0)
  
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  
  const formatDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  
  return {
    startDate: formatDate(monday),
    endDate: formatDate(sunday),
  }
}

const Summary: React.FC = () => {
  const [timeRangeType, setTimeRangeType] = useState<TimeRangeType>('week')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [weekOffset, setWeekOffset] = useState(-1)
  const [customDateRange, setCustomDateRange] = useState<DateRange>(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    return {
      startDate: dateStr,
      endDate: dateStr,
    }
  })
  
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>([])
  const [pendingTasks, setPendingTasks] = useState<CompletedTask[]>([])
  const [inProgressTasks, setInProgressTasks] = useState<CompletedTask[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [summary, setSummary] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

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

  const loadStatistics = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const { startDate, endDate } = getDateRange()
      
      const counts = await window.electronAPI.getCounts({ startDate, endDate })
      
      const tasks = await window.electronAPI.listTasks({ startDate, endDate })
      
      const processTask = async (task: { id: number; title: string; description: string | null; priority: string; status: string; due_date?: string | null; created_at?: string; updated_at?: string }) => {
        let history = undefined
        try {
          const taskHistory = await window.electronAPI.getTaskHistory(task.id, { limit: 5 })
          history = taskHistory.map(h => ({
            action: h.action,
            old_value: h.old_value,
            new_value: h.new_value,
            timestamp: h.timestamp,
          }))
        } catch (e) {
          console.error('Failed to get task history:', e)
        }
        
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
      
      const completedTasksList: CompletedTask[] = await Promise.all(
        tasks
          .filter(task => task.status === 'completed')
          .map(processTask)
      )
      
      const pendingTasksList: CompletedTask[] = await Promise.all(
        tasks
          .filter(task => task.status === 'pending')
          .map(processTask)
      )
      
      const inProgressTasksList: CompletedTask[] = await Promise.all(
        tasks
          .filter(task => task.status === 'in_progress')
          .map(processTask)
      )
      
      const priorityDistribution = {
        high: tasks.filter(t => t.priority === 'high').length,
        medium: tasks.filter(t => t.priority === 'medium').length,
        low: tasks.filter(t => t.priority === 'low').length,
      }
      
      let monthlyDistribution: { month: string; count: number }[] = []
      
      if (timeRangeType === 'year') {
        for (let month = 1; month <= 12; month++) {
          const monthStr = String(month).padStart(2, '0')
          const monthStart = `${selectedYear}-${monthStr}-01`
          const monthEnd = new Date(selectedYear, month, 0)
          const monthEndStr = formatDateLocal(monthEnd)
          
          const monthTasks = tasks.filter(task => {
            if (!task.created_at) return false
            const taskDate = task.created_at.split('T')[0]
            return taskDate >= monthStart && taskDate <= monthEndStr
          })
          
          monthlyDistribution.push({
            month: `${selectedYear}-${monthStr}`,
            count: monthTasks.length,
          })
        }
      } else {
        const { startDate, endDate } = getDateRange()
        const start = new Date(startDate)
        const end = new Date(endDate)
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
        
        for (let i = 0; i < days; i++) {
          const date = new Date(start)
          date.setDate(start.getDate() + i)
          const dateStr = formatDateLocal(date)
          
          const dayTasks = tasks.filter(task => {
            if (!task.created_at) return false
            const taskDate = task.created_at.split('T')[0]
            return taskDate === dateStr
          })
          
          monthlyDistribution.push({
            month: dateStr,
            count: dayTasks.length,
          })
        }
      }
      
      const completedTasksForCalc = tasks.filter(t => t.status === 'completed' && t.created_at && t.updated_at)
      let avgCompletionTime: number | undefined
      if (completedTasksForCalc.length > 0) {
        const totalDays = completedTasksForCalc.reduce((sum, task) => {
          const created = new Date(task.created_at).getTime()
          const completed = new Date(task.updated_at).getTime()
          return sum + (completed - created) / (1000 * 60 * 60 * 24)
        }, 0)
        avgCompletionTime = totalDays / completedTasksForCalc.length
      }
      
      const taskStats: TaskStats = {
        total: counts.all,
        completed: counts.completed,
        inProgress: counts.in_progress,
        pending: counts.pending,
        cancelled: counts.cancelled,
        completionRate: counts.all > 0 ? (counts.completed / counts.all) * 100 : 0,
        avgCompletionTime,
        priorityDistribution,
        monthlyDistribution,
      }
      
      setStats(taskStats)
      setCompletedTasks(completedTasksList)
      setPendingTasks(pendingTasksList)
      setInProgressTasks(inProgressTasksList)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [getDateRange, selectedYear, timeRangeType])

  useEffect(() => {
    loadStatistics()
  }, [loadStatistics])

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
      const title = timeRangeType === 'week' ? '周度工作总结' : '年度工作总结'
      
      const children: (Paragraph | Table)[] = []
      
      children.push(new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }))
      
      children.push(new Paragraph({
        children: [
          new TextRun({ text: '报告周期：', bold: true }),
          new TextRun({ text: `${startDate} 至 ${endDate}` }),
        ],
        spacing: { after: 400 },
      }))
      
      const lines = summary.split('\n')
      lines.forEach(line => {
        if (line.startsWith('### ')) {
          children.push(new Paragraph({
            text: line.substring(4),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200 },
          }))
        } else if (line.startsWith('## ')) {
          children.push(new Paragraph({
            text: line.substring(3),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300 },
          }))
        } else if (line.startsWith('# ')) {
          children.push(new Paragraph({
            text: line.substring(2),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400 },
          }))
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          children.push(new Paragraph({
            text: line.substring(2),
            bullet: { level: 0 },
          }))
        } else if (line.match(/^\d+\.\s/)) {
          children.push(new Paragraph({
            text: line.replace(/^\d+\.\s/, ''),
            bullet: { level: 0 },
          }))
        } else if (line.trim() !== '') {
          children.push(new Paragraph({ text: line }))
        }
      })
      
      children.push(new Paragraph({
        text: `生成时间: ${new Date().toLocaleString('zh-CN')}`,
        spacing: { before: 400 },
        alignment: AlignmentType.RIGHT,
      }))
      
      const doc = new Document({
        sections: [{ children }],
      })
      
      const buffer = await Packer.toBuffer(doc)
      
      const fileName = timeRangeType === 'week' 
        ? `周度工作总结_${startDate}_${endDate}.docx`
        : `年度工作总结_${selectedYear}.docx`
      
      const result = await window.electronAPI.saveBinaryFile({
        defaultPath: fileName,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
        content: Array.from(new Uint8Array(buffer)),
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
    const title = timeRangeType === 'week' ? '周度总结报告' : '年度总结报告'
    
    let md = `# ${title}\n\n`
    md += `**报告周期**：${startDate} 至 ${endDate}\n\n`
    
    if (stats) {
      md += `## 统计概览\n\n`
      md += `| 指标 | 数值 | 状态 |\n`
      md += `|:---|:---|:---|\n`
      md += `| 任务总数 | ${stats.total} | - |\n`
      md += `| 已完成 | ${stats.completed} | ${stats.completionRate >= 70 ? '✅ 良好' : stats.completionRate >= 40 ? '⚠️ 一般' : '❌ 需改进'} |\n`
      md += `| 进行中 | ${stats.inProgress} | - |\n`
      md += `| 待处理 | ${stats.pending} | - |\n`
      md += `| 完成率 | ${stats.completionRate.toFixed(1)}% | ${stats.completionRate >= 70 ? '✅ 达标' : stats.completionRate >= 40 ? '⚠️ 偏低' : '❌ 极低'} |\n`
      if (stats.avgCompletionTime !== undefined) {
        md += `| 平均完成时间 | ${stats.avgCompletionTime.toFixed(1)}天 | ${stats.avgCompletionTime <= 3 ? '✅ 高效' : stats.avgCompletionTime <= 7 ? '⚠️ 正常' : '❌ 较慢'} |\n`
      }
      md += `\n`
      
      md += `## 优先级分布\n\n`
      md += `| 优先级 | 数量 |\n`
      md += `|:---|:---|\n`
      md += `| 高优先级 | ${stats.priorityDistribution.high} |\n`
      md += `| 中优先级 | ${stats.priorityDistribution.medium} |\n`
      md += `| 低优先级 | ${stats.priorityDistribution.low} |\n`
      md += `\n`
      
      if (timeRangeType === 'week') {
        md += `## 任务详情\n\n`
        
        if (completedTasks.length > 0) {
          md += `### 已完成任务 (${completedTasks.length})\n\n`
          completedTasks.forEach((task, index) => {
            const priorityLabel = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'
            md += `${index + 1}. ${priorityLabel} **${task.title}**\n`
            if (task.description) {
              md += `   - 描述: ${task.description}\n`
            }
            if (task.completedAt) {
              md += `   - 完成时间: ${task.completedAt.split('T')[0]}\n`
            }
          })
          md += `\n`
        }
        
        if (inProgressTasks.length > 0) {
          md += `### 进行中任务 (${inProgressTasks.length})\n\n`
          inProgressTasks.forEach((task, index) => {
            const priorityLabel = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'
            md += `${index + 1}. ${priorityLabel} **${task.title}**\n`
            if (task.description) {
              md += `   - 描述: ${task.description}\n`
            }
            if (task.dueDate) {
              md += `   - 截止日期: ${task.dueDate}\n`
            }
          })
          md += `\n`
        }
        
        if (pendingTasks.length > 0) {
          md += `### 待处理任务 (${pendingTasks.length})\n\n`
          pendingTasks.forEach((task, index) => {
            const priorityLabel = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'
            md += `${index + 1}. ${priorityLabel} **${task.title}**\n`
            if (task.description) {
              md += `   - 描述: ${task.description}\n`
            }
            if (task.dueDate) {
              md += `   - 截止日期: ${task.dueDate}\n`
            }
          })
          md += `\n`
        }
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
      const title = timeRangeType === 'week' ? '周度总结报告' : '年度总结报告'
      
      const children: (Paragraph | Table)[] = []
      
      children.push(new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }))
      
      children.push(new Paragraph({
        children: [
          new TextRun({ text: '报告周期：', bold: true }),
          new TextRun({ text: `${startDate} 至 ${endDate}` }),
        ],
        spacing: { after: 400 },
      }))
      
      if (stats) {
        children.push(new Paragraph({
          text: '统计概览',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }))
        
        const statusText = (rate: number): string => {
          if (rate >= 70) return '✅ 良好'
          if (rate >= 40) return '⚠️ 一般'
          return '❌ 需改进'
        }
        
        const table = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: '指标', alignment: AlignmentType.CENTER })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: '数值', alignment: AlignmentType.CENTER })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: '状态', alignment: AlignmentType.CENTER })], width: { size: 34, type: WidthType.PERCENTAGE } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('任务总数')] }),
                new TableCell({ children: [new Paragraph({ text: String(stats.total), alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: '-', alignment: AlignmentType.CENTER })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('已完成')] }),
                new TableCell({ children: [new Paragraph({ text: String(stats.completed), alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: statusText(stats.completionRate), alignment: AlignmentType.CENTER })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('进行中')] }),
                new TableCell({ children: [new Paragraph({ text: String(stats.inProgress), alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: '-', alignment: AlignmentType.CENTER })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('待处理')] }),
                new TableCell({ children: [new Paragraph({ text: String(stats.pending), alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: '-', alignment: AlignmentType.CENTER })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('完成率')] }),
                new TableCell({ children: [new Paragraph({ text: `${stats.completionRate.toFixed(1)}%`, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: stats.completionRate >= 70 ? '✅ 达标' : stats.completionRate >= 40 ? '⚠️ 偏低' : '❌ 极低', alignment: AlignmentType.CENTER })] }),
              ],
            }),
          ],
        })
        
        children.push(table)
        
        if (timeRangeType === 'week') {
          if (completedTasks.length > 0) {
            children.push(new Paragraph({
              text: `已完成任务 (${completedTasks.length})`,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }))
            
            completedTasks.forEach((task, index) => {
              const priorityLabel = task.priority === 'high' ? '[高]' : task.priority === 'medium' ? '[中]' : '[低]'
              children.push(new Paragraph({
                children: [
                  new TextRun({ text: `${index + 1}. ${priorityLabel} `, bold: true }),
                  new TextRun({ text: task.title, bold: true }),
                ],
                spacing: { before: 100 },
              }))
              if (task.description) {
                children.push(new Paragraph({
                  text: `   描述: ${task.description}`,
                  indent: { left: 360 },
                }))
              }
            })
          }
          
          if (inProgressTasks.length > 0) {
            children.push(new Paragraph({
              text: `进行中任务 (${inProgressTasks.length})`,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }))
            
            inProgressTasks.forEach((task, index) => {
              const priorityLabel = task.priority === 'high' ? '[高]' : task.priority === 'medium' ? '[中]' : '[低]'
              children.push(new Paragraph({
                children: [
                  new TextRun({ text: `${index + 1}. ${priorityLabel} `, bold: true }),
                  new TextRun({ text: task.title, bold: true }),
                ],
                spacing: { before: 100 },
              }))
              if (task.description) {
                children.push(new Paragraph({
                  text: `   描述: ${task.description}`,
                  indent: { left: 360 },
                }))
              }
              if (task.dueDate) {
                children.push(new Paragraph({
                  text: `   截止日期: ${task.dueDate}`,
                  indent: { left: 360 },
                }))
              }
            })
          }
          
          if (pendingTasks.length > 0) {
            children.push(new Paragraph({
              text: `待处理任务 (${pendingTasks.length})`,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }))
            
            pendingTasks.forEach((task, index) => {
              const priorityLabel = task.priority === 'high' ? '[高]' : task.priority === 'medium' ? '[中]' : '[低]'
              children.push(new Paragraph({
                children: [
                  new TextRun({ text: `${index + 1}. ${priorityLabel} `, bold: true }),
                  new TextRun({ text: task.title, bold: true }),
                ],
                spacing: { before: 100 },
              }))
              if (task.description) {
                children.push(new Paragraph({
                  text: `   描述: ${task.description}`,
                  indent: { left: 360 },
                }))
              }
            })
          }
        }
      }
      
      if (summary) {
        children.push(new Paragraph({
          text: '智能总结',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }))
        
        const lines = summary.split('\n')
        lines.forEach(line => {
          if (line.startsWith('### ')) {
            children.push(new Paragraph({
              text: line.substring(4),
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 200 },
            }))
          } else if (line.startsWith('## ')) {
            children.push(new Paragraph({
              text: line.substring(3),
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300 },
            }))
          } else if (line.startsWith('# ')) {
            children.push(new Paragraph({
              text: line.substring(2),
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400 },
            }))
          } else if (line.startsWith('- ') || line.startsWith('* ')) {
            children.push(new Paragraph({
              text: line.substring(2),
              bullet: { level: 0 },
            }))
          } else if (line.match(/^\d+\.\s/)) {
            children.push(new Paragraph({
              text: line.replace(/^\d+\.\s/, ''),
              bullet: { level: 0 },
            }))
          } else if (line.trim() !== '') {
            children.push(new Paragraph({ text: line }))
          }
        })
      }
      
      children.push(new Paragraph({
        text: `报告生成时间: ${new Date().toLocaleString('zh-CN')}`,
        spacing: { before: 400 },
        alignment: AlignmentType.RIGHT,
      }))
      
      const doc = new Document({
        sections: [{ children }],
      })
      
      const buffer = await Packer.toBuffer(doc)
      
      const fileName = timeRangeType === 'week' 
        ? `周度总结_${startDate}_${endDate}.docx`
        : `年度总结_${selectedYear}.docx`
      
      const result = await window.electronAPI.saveBinaryFile({
        defaultPath: fileName,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
        content: Array.from(new Uint8Array(buffer)),
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

  const renderMarkdown = (text: string): React.ReactNode => {
    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    
    lines.forEach((line, index) => {
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={index} className="text-lg font-semibold text-gray-800 mt-4 mb-2">
            {line.substring(4)}
          </h3>
        )
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={index} className="text-xl font-bold text-gray-900 mt-6 mb-3">
            {line.substring(3)}
          </h2>
        )
      } else if (line.startsWith('# ')) {
        elements.push(
          <h1 key={index} className="text-2xl font-bold text-gray-900 mt-6 mb-4">
            {line.substring(2)}
          </h1>
        )
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <li key={index} className="ml-4 text-gray-700 mb-1">
            {line.substring(2)}
          </li>
        )
      } else if (line.match(/^\d+\.\s/)) {
        const content = line.replace(/^\d+\.\s/, '')
        elements.push(
          <li key={index} className="ml-4 text-gray-700 mb-1 list-decimal">
            {content}
          </li>
        )
      } else if (line.trim() === '') {
        elements.push(<br key={index} />)
      } else {
        elements.push(
          <p key={index} className="text-gray-700 mb-2">
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
    if (rate >= 70) return { color: 'bg-emerald-100 text-emerald-700', text: '✅ 达标' }
    if (rate >= 40) return { color: 'bg-amber-100 text-amber-700', text: '⚠️ 偏低' }
    return { color: 'bg-red-100 text-red-700', text: '❌ 极低' }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {timeRangeType === 'week' ? '上周总结' : timeRangeType === 'year' ? '年度总结' : '自定义总结'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {timeRangeType === 'week' 
              ? '查看上周任务统计，为周例会做准备' 
              : '查看任务统计和生成智能总结'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-gray-600">时间范围</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTimeRangeType('week'); setWeekOffset(-1); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRangeType === 'week'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              上周
            </button>
            <button
              onClick={() => setTimeRangeType('year')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRangeType === 'year'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              年度
            </button>
            <button
              onClick={() => setTimeRangeType('custom')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRangeType === 'custom'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              自定义
            </button>
          </div>
          
          {timeRangeType === 'year' ? (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
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
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
              />
              <span className="text-gray-400">至</span>
              <input
                type="date"
                value={customDateRange.endDate}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
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
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                导出 Markdown
              </button>
              <button
                onClick={handleExportWord}
                className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-all text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                导出 Word
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-500 mt-4">加载统计数据中...</p>
        </div>
      ) : stats ? (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              统计概览
              <span className="text-sm font-normal text-gray-500 ml-2">
                ({getDateRange().startDate} 至 {getDateRange().endDate})
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">指标</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">数值</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-700">任务总数</td>
                    <td className="py-3 px-4 text-center font-semibold text-gray-900">{stats.total}</td>
                    <td className="py-3 px-4 text-center text-gray-400">-</td>
                  </tr>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-700">已完成</td>
                    <td className="py-3 px-4 text-center font-semibold text-emerald-600">{stats.completed}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(stats.completionRate).color}`}>
                        {getStatusBadge(stats.completionRate).text}
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-700">进行中</td>
                    <td className="py-3 px-4 text-center font-semibold text-amber-600">{stats.inProgress}</td>
                    <td className="py-3 px-4 text-center text-gray-400">-</td>
                  </tr>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-700">待处理</td>
                    <td className="py-3 px-4 text-center font-semibold text-blue-600">{stats.pending}</td>
                    <td className="py-3 px-4 text-center text-gray-400">-</td>
                  </tr>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-700">完成率</td>
                    <td className="py-3 px-4 text-center font-semibold text-gray-900">{stats.completionRate.toFixed(1)}%</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(stats.completionRate).color}`}>
                        {getStatusBadge(stats.completionRate).text}
                      </span>
                    </td>
                  </tr>
                  {stats.avgCompletionTime !== undefined && (
                    <tr className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-700">平均完成时间</td>
                      <td className="py-3 px-4 text-center font-semibold text-gray-900">{stats.avgCompletionTime.toFixed(1)}天</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          stats.avgCompletionTime <= 3 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : stats.avgCompletionTime <= 7 
                              ? 'bg-amber-100 text-amber-700' 
                              : 'bg-red-100 text-red-700'
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
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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
                          <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                          {task.completedAt && (
                            <p className="text-xs text-gray-500">{task.completedAt.split('T')[0]}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {inProgressTasks.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <h3 className="text-lg font-semibold text-amber-600 mb-3">
                    🔄 进行中 ({inProgressTasks.length})
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {inProgressTasks.map((task, index) => (
                      <div key={index} className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
                        <span className="text-sm">
                          {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                          {task.dueDate && (
                            <p className="text-xs text-gray-500">截止: {task.dueDate}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {pendingTasks.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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
                          <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                          {task.dueDate && (
                            <p className="text-xs text-gray-500">截止: {task.dueDate}</p>
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
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">状态分布</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">待处理</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.pending / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{stats.pending}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">进行中</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-amber-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.inProgress / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{stats.inProgress}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">已完成</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-emerald-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{stats.completed}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">已取消</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-gray-400 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.cancelled / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{stats.cancelled}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">优先级分布</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">高优先级</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-red-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.priorityDistribution.high / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{stats.priorityDistribution.high}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">中优先级</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-yellow-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.priorityDistribution.medium / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{stats.priorityDistribution.medium}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">低优先级</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.priorityDistribution.low / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{stats.priorityDistribution.low}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">月度任务分布</h3>
                <div className="flex items-end gap-2 h-40">
                  {stats.monthlyDistribution.map((item, index) => {
                    const maxCount = Math.max(...stats.monthlyDistribution.map(m => m.count), 1)
                    const height = (item.count / maxCount) * 100
                    return (
                      <div key={index} className="flex-1 flex flex-col items-center">
                        <div className="w-full flex flex-col items-center justify-end h-32">
                          <span className="text-xs text-gray-500 mb-1">{item.count}</span>
                          <div 
                            className="w-full bg-blue-500 rounded-t transition-all duration-300"
                            style={{ height: `${height}%`, minHeight: item.count > 0 ? '4px' : '0' }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500 mt-2">{index + 1}月</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">智能总结</h3>
              <div className="flex items-center gap-2">
                {summary && (
                  <>
                    <button
                      onClick={handleExportSummaryMarkdown}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      导出 Markdown
                    </button>
                    <button
                      onClick={handleExportSummaryWord}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-all text-sm font-medium"
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
              <div className="prose max-w-none bg-gray-50 rounded-lg p-6">
                {renderMarkdown(summary)}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 mb-2">点击上方按钮生成智能总结</p>
                <p className="text-sm text-gray-400">需要配置 LLM API Key 才能使用此功能</p>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default Summary
