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
- 用户询问某个任务下面、里面、拆解出的子任务时，如果已有任务 ID，直接调用 list_subtasks；如果只有标题或关键词，先用 search_tasks 定位父任务，再调用 list_subtasks。
- 任务描述支持本地图片引用。用户在本轮对话附加图片并要求创建或更新任务时，直接调用 create_task 或 update_task；工具会自动把图片保存为 local:// 引用并追加到任务描述，不要回答“任务系统不支持图片”。
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
