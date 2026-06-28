import crypto from 'crypto'
import type Database from 'better-sqlite3'

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool' | 'summary'

export interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
  last_message_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  sequence_index: number
  role: ChatRole
  content: string | null
  tool_calls: string | null
  tool_call_id: string | null
  tool_name: string | null
  is_hidden: number
  created_at: string
}

export interface AppendChatMessageInput {
  session_id: string
  role: ChatRole
  content?: string | null
  tool_calls?: string | null
  tool_call_id?: string | null
  tool_name?: string | null
  is_hidden?: number
}

export class ChatStore {
  constructor(private db: Database.Database) {}

  createSession(title = '新对话'): ChatSession {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO chat_sessions (id, title, created_at, updated_at, last_message_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, title.trim() || '新对话', now, now, now)

    return { id, title: title.trim() || '新对话', created_at: now, updated_at: now, last_message_at: now }
  }

  ensureSession(sessionId: string, title = '新对话'): ChatSession {
    const existing = this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as ChatSession | undefined
    if (existing) {
      return existing
    }
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO chat_sessions (id, title, created_at, updated_at, last_message_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, title, now, now, now)
    return { id: sessionId, title, created_at: now, updated_at: now, last_message_at: now }
  }

  appendMessage(input: AppendChatMessageInput): ChatMessage {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const row = this.db.prepare(`
      SELECT COALESCE(MAX(sequence_index), 0) AS max_seq
      FROM chat_messages
      WHERE session_id = ?
    `).get(input.session_id) as { max_seq: number } | undefined
    const sequenceIndex = (row?.max_seq ?? 0) + 1

    this.db.prepare(`
      INSERT INTO chat_messages (
        id, session_id, sequence_index, role, content,
        tool_calls, tool_call_id, tool_name, is_hidden, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.session_id,
      sequenceIndex,
      input.role,
      input.content ?? null,
      input.tool_calls ?? null,
      input.tool_call_id ?? null,
      input.tool_name ?? null,
      input.is_hidden ?? 0,
      now
    )

    this.db.prepare(`
      UPDATE chat_sessions
      SET updated_at = ?, last_message_at = ?
      WHERE id = ?
    `).run(now, now, input.session_id)

    return {
      id,
      session_id: input.session_id,
      sequence_index: sequenceIndex,
      role: input.role,
      content: input.content ?? null,
      tool_calls: input.tool_calls ?? null,
      tool_call_id: input.tool_call_id ?? null,
      tool_name: input.tool_name ?? null,
      is_hidden: input.is_hidden ?? 0,
      created_at: now,
    }
  }

  loadMessages(sessionId: string): ChatMessage[] {
    return this.db.prepare(`
      SELECT *
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY sequence_index ASC
    `).all(sessionId) as ChatMessage[]
  }

  getRecentMessagesForLLM(sessionId: string, limit = 20): ChatMessage[] {
    return this.db.prepare(`
      SELECT *
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY sequence_index DESC
      LIMIT ?
    `).all(sessionId, limit).reverse() as ChatMessage[]
  }

  listSessions(): ChatSession[] {
    return this.db.prepare(`
      SELECT *
      FROM chat_sessions
      ORDER BY last_message_at DESC
    `).all() as ChatSession[]
  }

  deleteSession(sessionId: string): void {
    this.db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId)
  }

  renameSession(sessionId: string, title: string): void {
    this.db.prepare(`
      UPDATE chat_sessions
      SET title = ?, updated_at = ?
      WHERE id = ?
    `).run(title.trim() || '未命名对话', new Date().toISOString(), sessionId)
  }
}
