import type Database from 'better-sqlite3'
import { ActivityLedger, bumpTasksWriteVersion, type ActivityEventType } from './activityLedger'

const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const
const PRIORITIES = ['low', 'medium', 'high'] as const

type TaskStatus = typeof STATUSES[number]
type TaskPriority = typeof PRIORITIES[number]

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  hint?: string
  idempotent?: boolean
}

export type UpdateEmbeddingFn = (taskId: number, title: string, description: string | null) => Promise<void>

type ValidTaskInput = {
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  due_date?: string
  parent_id?: number | null
  sort_order: number
}

type TaskRow = {
  id: number
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  parent_id: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '创建单个任务，支持标题、描述、状态、优先级、截止日期和父任务 ID。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题，必填' },
          description: { type: 'string', description: '任务详细描述' },
          status: { type: 'string', enum: STATUSES, description: '任务状态，默认 in_progress' },
          priority: { type: 'string', enum: PRIORITIES, description: '任务优先级，默认 medium' },
          due_date: { type: 'string', description: '截止日期，必须是 YYYY-MM-DD' },
          parent_id: { type: 'integer', description: '父任务 ID' },
          sort_order: { type: 'integer', description: '排序值' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_create_tasks',
      description: '批量创建多个任务。适合用户一次说出多个待办事项，单次最多 20 个。',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                status: { type: 'string', enum: STATUSES },
                priority: { type: 'string', enum: PRIORITIES },
                due_date: { type: 'string', description: 'YYYY-MM-DD' },
                parent_id: { type: 'integer' },
              },
              required: ['title'],
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '更新指定任务。完成任务请设置 status=completed。',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'integer', description: '任务 ID' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: STATUSES },
          priority: { type: 'string', enum: PRIORITIES },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          parent_id: { type: 'integer' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: '删除指定任务。此操作不可逆，系统会先要求用户确认。',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'integer', description: '任务 ID' },
          reason: { type: 'string', description: '删除原因' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task',
      description: '获取指定任务详情和活动历史。',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'integer' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_tasks',
      description: '按状态、优先级、创建日期范围查询任务。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: STATUSES },
          priority: { type: 'string', enum: PRIORITIES },
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          endDate: { type: 'string', description: 'YYYY-MM-DD' },
          limit: { type: 'integer', default: 20 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_tasks',
      description: '通过关键词搜索任务标题和描述。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer', default: 10 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_activity',
      description: '查询活动账本，适合回答今天创建了什么、删除了什么、完成了什么等追溯问题。',
      parameters: {
        type: 'object',
        properties: {
          eventTypes: {
            type: 'array',
            items: { type: 'string', enum: ['task_created', 'task_updated', 'task_status_changed', 'task_deleted'] },
          },
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          endDate: { type: 'string', description: 'YYYY-MM-DD' },
          taskId: { type: 'integer' },
          sessionId: { type: 'string' },
          limit: { type: 'integer', default: 20 },
        },
        required: ['eventTypes'],
      },
    },
  },
] as const

export function needsHITL(toolName: string): boolean {
  return toolName === 'delete_task'
}

export class AgentToolsDispatcher {
  constructor(
    private db: Database.Database,
    private activityLedger: ActivityLedger,
    private updateTaskEmbedding: UpdateEmbeddingFn
  ) {}

  async execute(toolCall: ToolCall, context: { sessionId: string; messageId: string }): Promise<ToolResult> {
    if (['create_task', 'batch_create_tasks', 'update_task', 'delete_task'].includes(toolCall.name)) {
      const existing = this.activityLedger.findByToolCallId(toolCall.id)
      if (existing) {
        return { success: true, idempotent: true, data: existing }
      }
    }

    try {
      switch (toolCall.name) {
        case 'create_task':
          return this.createTask(validateTaskInput(toolCall.args), toolCall.id, context)
        case 'batch_create_tasks':
          return this.batchCreateTasks(validateBatchCreateArgs(toolCall.args), toolCall.id, context)
        case 'update_task':
          return this.updateTask(validateUpdateTaskArgs(toolCall.args), toolCall.id, context)
        case 'delete_task':
          return this.deleteTask(validateDeleteTaskArgs(toolCall.args), toolCall.id, context)
        case 'get_task':
          return this.getTask(validateTaskIdArgs(toolCall.args).taskId)
        case 'query_tasks':
          return this.queryTasks(validateQueryTasksArgs(toolCall.args))
        case 'search_tasks':
          return this.searchTasks(validateSearchTasksArgs(toolCall.args))
        case 'query_activity':
          return this.queryActivity(validateQueryActivityArgs(toolCall.args))
        default:
          return { success: false, error: `未知工具：${toolCall.name}` }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '工具执行失败',
        hint: '请按工具参数定义修正后重新调用。日期必须是 YYYY-MM-DD，状态和优先级必须使用英文枚举。',
      }
    }
  }

  private createTask(args: ValidTaskInput, toolCallId: string, context: { sessionId: string; messageId: string }): ToolResult {
    const task = insertTask(this.db, args)
    addHistoryRecord(this.db, task.id, 'created', null, {
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      parent_id: task.parent_id,
    })
    this.activityLedger.recordEvent({
      task_id: task.id,
      task_title_snapshot: task.title,
      event_type: 'task_created',
      actor: 'agent',
      new_value: task,
      content_snapshot: task.description,
      chat_session_id: context.sessionId,
      chat_message_id: context.messageId,
      metadata: { tool_call_id: toolCallId },
    })
    bumpTasksWriteVersion(this.db)
    void this.updateTaskEmbedding(task.id, task.title, task.description)
    return { success: true, data: task }
  }

  private batchCreateTasks(args: { tasks: ValidTaskInput[] }, toolCallId: string, context: { sessionId: string; messageId: string }): ToolResult {
    const createdTasks = this.db.transaction((tasks: ValidTaskInput[]) => {
      return tasks.map(task => insertTask(this.db, task))
    })(args.tasks) as TaskRow[]

    for (const task of createdTasks) {
      addHistoryRecord(this.db, task.id, 'created', null, task)
      this.activityLedger.recordEvent({
        task_id: task.id,
        task_title_snapshot: task.title,
        event_type: 'task_created',
        actor: 'agent',
        new_value: task,
        content_snapshot: task.description,
        chat_session_id: context.sessionId,
        chat_message_id: context.messageId,
        metadata: { tool_call_id: toolCallId, batch: true },
      })
      void this.updateTaskEmbedding(task.id, task.title, task.description)
    }

    bumpTasksWriteVersion(this.db)
    return { success: true, data: { count: createdTasks.length, tasks: createdTasks } }
  }

  private updateTask(args: { taskId: number; updates: Partial<ValidTaskInput> }, toolCallId: string, context: { sessionId: string; messageId: string }): ToolResult {
    const oldTask = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId) as TaskRow | undefined
    if (!oldTask) {
      return { success: false, error: `任务 #${args.taskId} 不存在` }
    }

    const fields: string[] = []
    const values: (string | number | null)[] = []
    const changedOld: Record<string, unknown> = {}
    const changedNew: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(args.updates)) {
      if (value === undefined) {
        continue
      }
      const oldValue = oldTask[key as keyof TaskRow]
      const normalizedValue = value === undefined ? null : value
      if (oldValue !== normalizedValue) {
        fields.push(`${key} = ?`)
        values.push(normalizedValue)
        changedOld[key] = oldValue
        changedNew[key] = normalizedValue
      }
    }

    if (fields.length === 0) {
      return { success: true, data: oldTask }
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values, args.taskId)
    const newTask = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId) as TaskRow
    const eventType: ActivityEventType = args.updates.status !== undefined && args.updates.status !== oldTask.status
      ? 'task_status_changed'
      : 'task_updated'

    addHistoryRecord(this.db, args.taskId, eventType === 'task_status_changed' ? 'status_changed' : 'updated', changedOld, changedNew)
    this.activityLedger.recordEvent({
      task_id: args.taskId,
      task_title_snapshot: newTask.title,
      event_type: eventType,
      actor: 'agent',
      old_value: eventType === 'task_status_changed' ? oldTask.status : changedOld,
      new_value: eventType === 'task_status_changed' ? newTask.status : changedNew,
      content_snapshot: newTask.description,
      chat_session_id: context.sessionId,
      chat_message_id: context.messageId,
      metadata: { tool_call_id: toolCallId },
    })

    bumpTasksWriteVersion(this.db)
    if (args.updates.title !== undefined || args.updates.description !== undefined) {
      void this.updateTaskEmbedding(newTask.id, newTask.title, newTask.description)
    }

    return { success: true, data: newTask }
  }

  private deleteTask(args: { taskId: number; reason?: string }, toolCallId: string, context: { sessionId: string; messageId: string }): ToolResult {
    const rootTask = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.taskId) as TaskRow | undefined
    if (!rootTask) {
      return { success: false, error: `任务 #${args.taskId} 不存在` }
    }

    const taskIds = collectSubtaskIds(this.db, args.taskId)
    const tasks = [rootTask, ...taskIds.map(id => this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow).filter(Boolean)]

    const remove = this.db.transaction(() => {
      for (const task of tasks) {
        this.activityLedger.recordEvent({
          task_id: task.id,
          task_title_snapshot: task.title,
          event_type: 'task_deleted',
          actor: 'agent',
          old_value: task,
          content_snapshot: task.description,
          chat_session_id: context.sessionId,
          chat_message_id: context.messageId,
          metadata: { tool_call_id: toolCallId, reason: args.reason },
        })
        this.db.prepare('DELETE FROM task_embeddings WHERE task_id = ?').run(task.id)
        this.db.prepare('DELETE FROM task_history WHERE task_id = ?').run(task.id)
        this.db.prepare('DELETE FROM image_texts WHERE task_id = ?').run(task.id)
        this.db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id)
      }
    })

    remove()
    bumpTasksWriteVersion(this.db)
    return { success: true, data: { deleted: true, count: tasks.length, taskId: rootTask.id, title: rootTask.title } }
  }

  private getTask(taskId: number): ToolResult {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined
    if (!task) {
      return { success: false, error: `任务 #${taskId} 不存在` }
    }
    const activity = this.activityLedger.queryEvents({ taskId, limit: 20 })
    return { success: true, data: { task, activity } }
  }

  private queryTasks(args: { status?: TaskStatus; priority?: TaskPriority; startDate?: string; endDate?: string; limit: number }): ToolResult {
    let sql = 'SELECT * FROM tasks WHERE parent_id IS NULL'
    const params: (string | number)[] = []

    if (args.status) {
      sql += ' AND status = ?'
      params.push(args.status)
    }
    if (args.priority) {
      sql += ' AND priority = ?'
      params.push(args.priority)
    }
    if (args.startDate) {
      sql += " AND date(created_at, 'localtime') >= ?"
      params.push(args.startDate)
    }
    if (args.endDate) {
      sql += " AND date(created_at, 'localtime') <= ?"
      params.push(args.endDate)
    }

    sql += ' ORDER BY updated_at DESC, created_at DESC LIMIT ?'
    params.push(args.limit)
    const tasks = this.db.prepare(sql).all(...params) as TaskRow[]
    return { success: true, data: { count: tasks.length, tasks } }
  }

  private searchTasks(args: { query: string; limit: number }): ToolResult {
    const like = `%${args.query}%`
    const tasks = this.db.prepare(`
      SELECT *
      FROM tasks
      WHERE parent_id IS NULL AND (title LIKE ? OR COALESCE(description, '') LIKE ?)
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `).all(like, like, args.limit) as TaskRow[]
    return { success: true, data: { count: tasks.length, tasks } }
  }

  private queryActivity(args: { eventTypes: ActivityEventType[]; startDate?: string; endDate?: string; taskId?: number; sessionId?: string; limit: number }): ToolResult {
    const events = this.activityLedger.queryEvents(args)
    return { success: true, data: { count: events.length, events } }
  }
}

function validateTaskInput(args: Record<string, unknown>): ValidTaskInput {
  const title = readString(args, 'title', true)
  if (title.length > 200) {
    throw new Error('title: 标题不能超过 200 字符')
  }

  return {
    title,
    description: readOptionalString(args, 'description', 5000),
    status: readEnum(args, 'status', STATUSES, 'in_progress'),
    priority: readEnum(args, 'priority', PRIORITIES, 'medium'),
    due_date: readOptionalDate(args, 'due_date'),
    parent_id: readOptionalInteger(args, 'parent_id'),
    sort_order: readOptionalInteger(args, 'sort_order') ?? 0,
  }
}

function validateBatchCreateArgs(args: Record<string, unknown>): { tasks: ValidTaskInput[] } {
  if (!Array.isArray(args.tasks)) {
    throw new Error('tasks: 必须是数组')
  }
  if (args.tasks.length === 0 || args.tasks.length > 20) {
    throw new Error('tasks: 单次批量创建数量必须在 1 到 20 之间')
  }
  return { tasks: args.tasks.map(task => validateTaskInput(toObject(task))) }
}

function validateUpdateTaskArgs(args: Record<string, unknown>): { taskId: number; updates: Partial<ValidTaskInput> } {
  const taskId = readRequiredInteger(args, 'taskId')
  const updates: Partial<ValidTaskInput> = {}

  if (args.title !== undefined) {
    updates.title = readString(args, 'title', true)
  }
  if (args.description !== undefined) {
    updates.description = readOptionalString(args, 'description', 5000) ?? ''
  }
  if (args.status !== undefined) {
    updates.status = readEnum(args, 'status', STATUSES)
  }
  if (args.priority !== undefined) {
    updates.priority = readEnum(args, 'priority', PRIORITIES)
  }
  if (args.due_date !== undefined) {
    updates.due_date = readOptionalDate(args, 'due_date') ?? ''
  }
  if (args.parent_id !== undefined) {
    updates.parent_id = readOptionalInteger(args, 'parent_id')
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('update_task: 至少需要提供一个要更新的字段')
  }

  return { taskId, updates }
}

function validateDeleteTaskArgs(args: Record<string, unknown>): { taskId: number; reason?: string } {
  return {
    taskId: readRequiredInteger(args, 'taskId'),
    reason: readOptionalString(args, 'reason', 500),
  }
}

function validateTaskIdArgs(args: Record<string, unknown>): { taskId: number } {
  return { taskId: readRequiredInteger(args, 'taskId') }
}

function validateQueryTasksArgs(args: Record<string, unknown>): { status?: TaskStatus; priority?: TaskPriority; startDate?: string; endDate?: string; limit: number } {
  return {
    status: args.status === undefined ? undefined : readEnum(args, 'status', STATUSES),
    priority: args.priority === undefined ? undefined : readEnum(args, 'priority', PRIORITIES),
    startDate: readOptionalDate(args, 'startDate'),
    endDate: readOptionalDate(args, 'endDate'),
    limit: readLimit(args, 20, 100),
  }
}

function validateSearchTasksArgs(args: Record<string, unknown>): { query: string; limit: number } {
  return {
    query: readString(args, 'query', true),
    limit: readLimit(args, 10, 50),
  }
}

function validateQueryActivityArgs(args: Record<string, unknown>): { eventTypes: ActivityEventType[]; startDate?: string; endDate?: string; taskId?: number; sessionId?: string; limit: number } {
  const validTypes: ActivityEventType[] = ['task_created', 'task_updated', 'task_status_changed', 'task_deleted']
  if (!Array.isArray(args.eventTypes) || args.eventTypes.length === 0) {
    throw new Error('eventTypes: 至少指定一个事件类型')
  }

  const eventTypes = args.eventTypes.map(item => {
    if (typeof item !== 'string' || !validTypes.includes(item as ActivityEventType)) {
      throw new Error(`eventTypes: 不支持的事件类型 ${String(item)}`)
    }
    return item as ActivityEventType
  })

  return {
    eventTypes,
    startDate: readOptionalDate(args, 'startDate'),
    endDate: readOptionalDate(args, 'endDate'),
    taskId: args.taskId === undefined ? undefined : readRequiredInteger(args, 'taskId'),
    sessionId: readOptionalString(args, 'sessionId', 100),
    limit: readLimit(args, 20, 100),
  }
}

function insertTask(db: Database.Database, args: ValidTaskInput): TaskRow {
  const result = db.prepare(`
    INSERT INTO tasks (title, description, status, priority, due_date, parent_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    args.title,
    args.description ?? null,
    args.status,
    args.priority,
    args.due_date ?? null,
    args.parent_id ?? null,
    args.sort_order
  )
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(result.lastInsertRowid)) as TaskRow
}

function addHistoryRecord(db: Database.Database, taskId: number, action: string, oldValue: unknown, newValue: unknown): void {
  db.prepare('INSERT INTO task_history (task_id, action, old_value, new_value) VALUES (?, ?, ?, ?)')
    .run(taskId, action, serializeHistoryValue(oldValue), serializeHistoryValue(newValue))
}

function collectSubtaskIds(db: Database.Database, parentId: number): number[] {
  const rows = db.prepare('SELECT id FROM tasks WHERE parent_id = ?').all(parentId) as { id: number }[]
  return rows.flatMap(row => [row.id, ...collectSubtaskIds(db, row.id)])
}

function serializeHistoryValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('参数必须是对象')
  }
  return value as Record<string, unknown>
}

function readString(args: Record<string, unknown>, key: string, required = false): string {
  const value = args[key]
  if (typeof value !== 'string') {
    if (required) {
      throw new Error(`${key}: 必须是字符串`)
    }
    return ''
  }
  const trimmed = value.trim()
  if (required && !trimmed) {
    throw new Error(`${key}: 不能为空`)
  }
  return trimmed
}

function readOptionalString(args: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  if (args[key] === undefined || args[key] === null) {
    return undefined
  }
  const value = readString(args, key)
  if (value.length > maxLength) {
    throw new Error(`${key}: 不能超过 ${maxLength} 字符`)
  }
  return value
}

function readEnum<T extends readonly string[]>(args: Record<string, unknown>, key: string, values: T, fallback?: T[number]): T[number] {
  const value = args[key]
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) {
      return fallback
    }
    throw new Error(`${key}: 不能为空`)
  }
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`${key}: 必须是 ${values.join(', ')} 之一`)
  }
  return value
}

function readRequiredInteger(args: Record<string, unknown>, key: string): number {
  const value = readOptionalInteger(args, key)
  if (!Number.isInteger(value) || value === null || value === undefined) {
    throw new Error(`${key}: 必须是整数`)
  }
  return value
}

function readOptionalInteger(args: Record<string, unknown>, key: string): number | null | undefined {
  const value = args[key]
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return Number(value)
  }
  throw new Error(`${key}: 必须是整数`)
}

function readOptionalDate(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key}: 日期必须为 YYYY-MM-DD 格式`)
  }
  return value
}

function readLimit(args: Record<string, unknown>, fallback: number, max: number): number {
  const raw = args.limit
  if (raw === undefined || raw === null) {
    return fallback
  }
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`limit: 必须是 1 到 ${max} 之间的整数`)
  }
  return value
}
