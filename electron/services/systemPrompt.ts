import type Database from 'better-sqlite3'

interface SystemPromptCache {
  content: string
  builtAt: number
  version: number
}

type TaskSummaryRow = {
  id: number
  title: string
  status: string
  priority: string
  due_date: string | null
}

export class SystemPromptBuilder {
  private cache: SystemPromptCache | null = null
  private readonly ttlMs = 60_000

  constructor(private db: Database.Database) {}

  build(): string {
    const version = this.getCurrentVersion()
    if (this.cache && this.cache.version === version && Date.now() - this.cache.builtAt < this.ttlMs) {
      return this.cache.content
    }

    const today = formatLocalDate(new Date())
    const stats = this.getTaskStats()
    const recentTasks = this.getRecentTasks()
    const content = `
你是这个桌面任务管理器里的对话式任务 Agent。当前日期：${today}。

你可以直接回答任务统计问题，也可以在需要读写任务数据时调用工具。

## 当前任务统计
- 待处理：${stats.pending}
- 进行中：${stats.in_progress}
- 已完成：${stats.completed}
- 已取消：${stats.cancelled}
- 总计：${stats.total}

## 最近 20 条任务
${recentTasks.length ? recentTasks.map(task => `- #${task.id} ${task.title} | 状态: ${task.status} | 优先级: ${task.priority}${task.due_date ? ` | 截止: ${task.due_date}` : ''}`).join('\n') : '- 暂无任务'}

## 行为规则
- 简单统计和最近任务问题，优先基于上面的上下文直接回答。
- 创建、更新、删除、精确查询历史时使用工具。
- 日期字段必须使用 YYYY-MM-DD，例如 ${today}。
- 删除任务属于破坏性操作，会要求用户确认后才执行。
- 回答使用中文，简洁明确，必要时列出任务 ID。
`.trim()

    this.cache = { content, builtAt: Date.now(), version }
    return content
  }

  private getCurrentVersion(): number {
    const row = this.db.prepare("SELECT value FROM kv_store WHERE key = 'tasks_write_version'").get() as { value: string } | undefined
    return Number.parseInt(row?.value ?? '0', 10) || 0
  }

  private getTaskStats(): Record<string, number> {
    const rows = this.db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all() as { status: string; count: number }[]
    const stats: Record<string, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      total: 0,
    }

    for (const row of rows) {
      if (row.status in stats) {
        stats[row.status] = row.count
      }
      stats.total += row.count
    }

    return stats
  }

  private getRecentTasks(): TaskSummaryRow[] {
    return this.db.prepare(`
      SELECT id, title, status, priority, due_date
      FROM tasks
      WHERE parent_id IS NULL
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 20
    `).all() as TaskSummaryRow[]
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
