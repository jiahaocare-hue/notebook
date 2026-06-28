import crypto from 'crypto'
import type Database from 'better-sqlite3'

export type ActivityEventType = 'task_created' | 'task_updated' | 'task_status_changed' | 'task_deleted'
export type ActivityActor = 'user' | 'agent'

export interface ActivityEvent {
  id: string
  task_id: number | null
  task_title_snapshot: string | null
  event_type: ActivityEventType
  event_time: string
  actor: ActivityActor
  old_value: string | null
  new_value: string | null
  content_snapshot: string | null
  chat_session_id: string | null
  chat_message_id: string | null
  metadata: string | null
}

export interface RecordEventInput {
  task_id?: number | null
  task_title_snapshot?: string | null
  event_type: ActivityEventType
  actor?: ActivityActor
  old_value?: unknown
  new_value?: unknown
  content_snapshot?: string | null
  chat_session_id?: string | null
  chat_message_id?: string | null
  metadata?: Record<string, unknown> | null
}

export class ActivityLedger {
  constructor(private db: Database.Database) {}

  recordEvent(input: RecordEventInput): string {
    const id = crypto.randomUUID()
    this.db.prepare(`
      INSERT INTO activity_events (
        id, task_id, task_title_snapshot, event_type, actor,
        old_value, new_value, content_snapshot,
        chat_session_id, chat_message_id, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.task_id ?? null,
      input.task_title_snapshot ?? null,
      input.event_type,
      input.actor ?? 'user',
      serializeJson(input.old_value),
      serializeJson(input.new_value),
      input.content_snapshot ?? null,
      input.chat_session_id ?? null,
      input.chat_message_id ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null
    )
    return id
  }

  queryEvents(filters: {
    eventTypes?: ActivityEventType[]
    startDate?: string
    endDate?: string
    taskId?: number
    sessionId?: string
    limit?: number
  }): ActivityEvent[] {
    const clauses: string[] = []
    const params: (string | number)[] = []

    if (filters.eventTypes?.length) {
      clauses.push(`event_type IN (${filters.eventTypes.map(() => '?').join(', ')})`)
      params.push(...filters.eventTypes)
    }
    if (filters.startDate) {
      clauses.push("date(event_time, 'localtime') >= ?")
      params.push(filters.startDate)
    }
    if (filters.endDate) {
      clauses.push("date(event_time, 'localtime') <= ?")
      params.push(filters.endDate)
    }
    if (filters.taskId !== undefined) {
      clauses.push('task_id = ?')
      params.push(filters.taskId)
    }
    if (filters.sessionId) {
      clauses.push('chat_session_id = ?')
      params.push(filters.sessionId)
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    params.push(Math.max(1, Math.min(filters.limit ?? 20, 100)))

    return this.db.prepare(`
      SELECT *
      FROM activity_events
      ${whereSql}
      ORDER BY event_time DESC
      LIMIT ?
    `).all(...params) as ActivityEvent[]
  }

  findByToolCallId(toolCallId: string): ActivityEvent | null {
    const row = this.db.prepare(`
      SELECT *
      FROM activity_events
      WHERE json_extract(metadata, '$.tool_call_id') = ?
      LIMIT 1
    `).get(toolCallId) as ActivityEvent | undefined

    return row ?? null
  }
}

export function bumpTasksWriteVersion(db: Database.Database): void {
  db.prepare(`
    INSERT OR REPLACE INTO kv_store (key, value)
    VALUES (
      'tasks_write_version',
      COALESCE((SELECT CAST(value AS INTEGER) + 1 FROM kv_store WHERE key = 'tasks_write_version'), 1)
    )
  `).run()
}

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  return typeof value === 'string' ? value : JSON.stringify(value)
}
