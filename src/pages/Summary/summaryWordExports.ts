import type { CompletedTask, DateFilterMode, TaskStats, TaskWithHistory } from '../../types'
import type { TimeRangeType } from './summaryUtils'
import {
  formatHistoryEntry,
  priorityLabelMap,
  statusLabelMap,
  stripImageMarks,
} from './summaryExports'

type DocxModule = Awaited<typeof import('docx')>

interface SummaryWordOptions {
  endDate: string
  selectedYear: number
  startDate: string
  summary: string
  timeRangeType: TimeRangeType
}

interface SummaryReportWordOptions extends SummaryWordOptions {
  completedTasks: CompletedTask[]
  inProgressTasks: CompletedTask[]
  pendingTasks: CompletedTask[]
  stats: TaskStats | null
}

interface TaskDataWordOptions {
  dateFilterMode: DateFilterMode
  endDate: string
  startDate: string
  tasks: TaskWithHistory[]
}

function toBinaryContent(arrayBuffer: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(arrayBuffer))
}

function getCompletionStatusText(rate: number): string {
  if (rate >= 70) return '✅ 良好'
  if (rate >= 40) return '⚠️ 一般'
  return '❌ 需改进'
}

function getCompletionBadgeText(rate: number): string {
  if (rate >= 70) return '✅ 达标'
  if (rate >= 40) return '⚠️ 偏低'
  return '❌ 极低'
}

function getPriorityMarker(priority: CompletedTask['priority']): string {
  if (priority === 'high') return '[高]'
  if (priority === 'medium') return '[中]'
  return '[低]'
}

function getDateFilterModeLabel(dateFilterMode: DateFilterMode): string {
  if (dateFilterMode === 'updated') return '更新时间'
  if (dateFilterMode === 'created_or_updated') return '创建或更新时间'
  return '创建时间'
}

function appendMarkdownParagraphs(children: any[], summary: string, docx: DocxModule) {
  const { Paragraph, HeadingLevel } = docx

  summary.split('\n').forEach(line => {
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
    } else if (/^\d+\.\s/.test(line)) {
      children.push(new Paragraph({
        text: line.replace(/^\d+\.\s/, ''),
        bullet: { level: 0 },
      }))
    } else if (line.trim() !== '') {
      children.push(new Paragraph({ text: line }))
    }
  })
}

async function packDocument(children: any[], docx: DocxModule): Promise<number[]> {
  const { Document, Packer } = docx
  const doc = new Document({
    sections: [{ children }],
  })
  const blob = await Packer.toBlob(doc)
  return toBinaryContent(await blob.arrayBuffer())
}

export async function buildGeneratedSummaryWordContent({
  endDate,
  startDate,
  summary,
  timeRangeType,
}: SummaryWordOptions): Promise<number[]> {
  const docx = await import('docx')
  const { AlignmentType, HeadingLevel, Paragraph, TextRun } = docx
  const title = timeRangeType === 'week' ? '周度工作总结' : '年度工作总结'
  const children: any[] = []

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

  appendMarkdownParagraphs(children, summary, docx)

  children.push(new Paragraph({
    text: `生成时间: ${new Date().toLocaleString('zh-CN')}`,
    spacing: { before: 400 },
    alignment: AlignmentType.RIGHT,
  }))

  return packDocument(children, docx)
}

function appendTaskSection(
  children: any[],
  title: string,
  tasks: CompletedTask[],
  includeDueDate: boolean,
  docx: DocxModule
) {
  if (tasks.length === 0) return

  const { HeadingLevel, Paragraph, TextRun } = docx

  children.push(new Paragraph({
    text: `${title} (${tasks.length})`,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
  }))

  tasks.forEach((task, index) => {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${index + 1}. ${getPriorityMarker(task.priority)} `, bold: true }),
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
    if (includeDueDate && task.dueDate) {
      children.push(new Paragraph({
        text: `   截止日期: ${task.dueDate}`,
        indent: { left: 360 },
      }))
    }
  })
}

export async function buildSummaryReportWordContent({
  completedTasks,
  endDate,
  inProgressTasks,
  pendingTasks,
  startDate,
  stats,
  summary,
  timeRangeType,
}: SummaryReportWordOptions): Promise<number[]> {
  const docx = await import('docx')
  const {
    AlignmentType,
    HeadingLevel,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = docx
  const title = timeRangeType === 'week' ? '周度总结报告' : '年度总结报告'
  const children: any[] = []

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

    children.push(new Table({
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
            new TableCell({ children: [new Paragraph({ text: getCompletionStatusText(stats.completionRate), alignment: AlignmentType.CENTER })] }),
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
            new TableCell({ children: [new Paragraph({ text: getCompletionBadgeText(stats.completionRate), alignment: AlignmentType.CENTER })] }),
          ],
        }),
      ],
    }))

    if (timeRangeType === 'week') {
      appendTaskSection(children, '已完成任务', completedTasks, false, docx)
      appendTaskSection(children, '进行中任务', inProgressTasks, true, docx)
      appendTaskSection(children, '待处理任务', pendingTasks, false, docx)
    }
  }

  if (summary) {
    children.push(new Paragraph({
      text: '智能总结',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    }))
    appendMarkdownParagraphs(children, summary, docx)
  }

  children.push(new Paragraph({
    text: `报告生成时间: ${new Date().toLocaleString('zh-CN')}`,
    spacing: { before: 400 },
    alignment: AlignmentType.RIGHT,
  }))

  return packDocument(children, docx)
}

export async function buildTaskDataWordContent({
  dateFilterMode,
  endDate,
  startDate,
  tasks,
}: TaskDataWordOptions): Promise<number[]> {
  const docx = await import('docx')
  const { AlignmentType, HeadingLevel, Paragraph, TextRun } = docx
  const children: any[] = []

  children.push(new Paragraph({
    text: '任务数据导出',
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }))

  children.push(new Paragraph({
    children: [
      new TextRun({ text: '时间范围：', bold: true }),
      new TextRun({ text: `${startDate} 至 ${endDate}` }),
    ],
    spacing: { after: 200 },
  }))

  children.push(new Paragraph({
    children: [
      new TextRun({ text: '筛选模式：', bold: true }),
      new TextRun({ text: getDateFilterModeLabel(dateFilterMode) }),
    ],
    spacing: { after: 400 },
  }))

  children.push(new Paragraph({
    text: '',
    spacing: { after: 200 },
  }))

  tasks.forEach((task, index) => {
    children.push(new Paragraph({
      text: `${index + 1}. ${task.title}`,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 200 },
    }))

    children.push(new Paragraph({
      children: [
        new TextRun({ text: '创建时间：', bold: true }),
        new TextRun({ text: task.created_at.split('T')[0] }),
      ],
      spacing: { after: 80 },
    }))

    children.push(new Paragraph({
      children: [
        new TextRun({ text: '优先级：', bold: true }),
        new TextRun({ text: priorityLabelMap[task.priority] || task.priority }),
      ],
      spacing: { after: 80 },
    }))

    children.push(new Paragraph({
      children: [
        new TextRun({ text: '状态：', bold: true }),
        new TextRun({ text: statusLabelMap[task.status] || task.status }),
      ],
      spacing: { after: 80 },
    }))

    children.push(new Paragraph({
      children: [
        new TextRun({ text: '截止日期：', bold: true }),
        new TextRun({ text: task.due_date || '无' }),
      ],
      spacing: { after: 200 },
    }))

    if (task.description) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: '描述：', bold: true }),
        ],
        spacing: { after: 80 },
      }))
      children.push(new Paragraph({
        text: stripImageMarks(task.description),
        spacing: { after: 200 },
      }))
    }

    if (task.history && task.history.length > 0) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: '变更历史：', bold: true }),
        ],
        spacing: { after: 80 },
      }))
      task.history.forEach(h => {
        children.push(new Paragraph({
          text: formatHistoryEntry(h),
          bullet: { level: 0 },
        }))
      })
    }

    children.push(new Paragraph({
      text: '',
      spacing: { before: 200, after: 200 },
      border: {
        bottom: { style: 'single', size: 1, color: 'CCCCCC' },
      },
    }))
  })

  children.push(new Paragraph({
    text: `导出时间: ${new Date().toLocaleString('zh-CN')}`,
    spacing: { before: 400 },
    alignment: AlignmentType.RIGHT,
  }))

  return packDocument(children, docx)
}
