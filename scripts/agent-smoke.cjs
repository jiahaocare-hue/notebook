const fs = require('fs')
const os = require('os')
const path = require('path')
const Database = require('better-sqlite3')

const rootDir = path.resolve(__dirname, '..')
const distServicesDir = path.join(rootDir, 'dist-electron', 'electron', 'services')

const { ActivityLedger } = require(path.join(distServicesDir, 'activityLedger.js'))
const { AgentToolsDispatcher, needsHITL } = require(path.join(distServicesDir, 'agentTools.js'))
const { ChatStore } = require(path.join(distServicesDir, 'chatStore.js'))
const { SystemPromptBuilder } = require(path.join(distServicesDir, 'systemPrompt.js'))

const results = []

function pass(name, detail = '') {
  results.push({ status: 'PASS', name, detail })
}

function fail(name, detail = '') {
  results.push({ status: 'FAIL', name, detail })
}

function assert(condition, name, detail = '') {
  if (condition) {
    pass(name, detail)
  } else {
    fail(name, detail)
  }
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'in_progress',
      priority TEXT DEFAULT 'medium',
      due_date TEXT,
      parent_id INTEGER DEFAULT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE task_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      embedding TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE image_texts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      image_path TEXT NOT NULL,
      text_content TEXT,
      ocr_status TEXT DEFAULT 'pending',
      ocr_error TEXT,
      ocr_timestamp TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE activity_events (
      id TEXT PRIMARY KEY,
      task_id INTEGER,
      task_title_snapshot TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('task_created', 'task_updated', 'task_status_changed', 'task_deleted')),
      event_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      actor TEXT NOT NULL DEFAULT 'user' CHECK(actor IN ('user', 'agent')),
      old_value TEXT,
      new_value TEXT,
      content_snapshot TEXT,
      chat_session_id TEXT,
      chat_message_id TEXT,
      metadata TEXT
    );

    CREATE INDEX idx_activity_events_type_time ON activity_events (event_type, event_time);
    CREATE INDEX idx_activity_events_task_time ON activity_events (task_id, event_time);
    CREATE INDEX idx_activity_events_session ON activity_events (chat_session_id);

    CREATE TABLE chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      last_message_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sequence_index INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool', 'summary')),
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX idx_chat_messages_session_seq ON chat_messages (session_id, sequence_index);

    CREATE TABLE kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT INTO kv_store (key, value) VALUES ('tasks_write_version', '0');
  `)
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-manager-agent-smoke-'))
  const tempDbPath = path.join(tempDir, 'tasks.db')
  const db = new Database(tempDbPath)
  const embeddingCalls = []

  try {
    createSchema(db)

    const activityLedger = new ActivityLedger(db)
    const chatStore = new ChatStore(db)
    const dispatcher = new AgentToolsDispatcher(db, activityLedger, async (taskId, title, description) => {
      embeddingCalls.push({ taskId, title, description })
    })
    const systemPromptBuilder = new SystemPromptBuilder(db)

    assert(needsHITL('delete_task') === true, 'delete_task 需要 HITL')
    assert(needsHITL('create_task') === false, 'create_task 不需要 HITL')

    const session = chatStore.createSession('Smoke 会话')
    const userMessage = chatStore.appendMessage({
      session_id: session.id,
      role: 'user',
      content: '创建一个任务',
      is_hidden: 0,
    })
    const assistantMessage = chatStore.appendMessage({
      session_id: session.id,
      role: 'assistant',
      content: '准备调用工具',
      is_hidden: 0,
    })

    const messages = chatStore.loadMessages(session.id)
    assert(messages.length === 2, 'ChatStore 可持久化并加载消息', `${messages.length} messages`)
    assert(messages[0].sequence_index === 1 && messages[1].sequence_index === 2, 'ChatStore sequence_index 严格递增')
    assert(userMessage.id !== assistantMessage.id, 'ChatStore 消息 ID 唯一')

    const invalidDateResult = await dispatcher.execute({
      id: 'tool-invalid-date',
      name: 'create_task',
      args: {
        title: '日期校验任务',
        due_date: '明天',
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    assert(invalidDateResult.success === false, '工具层拒绝自然语言日期', invalidDateResult.error || '')
    assert(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count === 0, '参数校验失败不会写入任务')

    const createResult = await dispatcher.execute({
      id: 'tool-create-1',
      name: 'create_task',
      args: {
        title: '准备季度报告',
        priority: 'high',
        due_date: '2026-06-29',
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    assert(createResult.success === true, 'create_task 可创建任务')

    const createdTask = db.prepare('SELECT * FROM tasks WHERE title = ?').get('准备季度报告')
    assert(Boolean(createdTask), 'create_task 写入 tasks 表', createdTask ? `task_id=${createdTask.id}` : '')
    assert(db.prepare("SELECT value FROM kv_store WHERE key = 'tasks_write_version'").get().value === '1', 'create_task 递增 tasks_write_version')
    assert(db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE event_type = 'task_created' AND actor = 'agent'").get().count === 1, 'create_task 写入 agent 活动账本')
    assert(db.prepare('SELECT COUNT(*) AS count FROM task_history').get().count === 1, 'create_task 兼容写入 task_history')
    assert(embeddingCalls.length === 1, 'create_task 触发 embedding 更新')

    const duplicateCreateResult = await dispatcher.execute({
      id: 'tool-create-1',
      name: 'create_task',
      args: {
        title: '不应重复创建',
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    assert(duplicateCreateResult.success === true && duplicateCreateResult.idempotent === true, '相同 tool_call_id 写操作幂等返回')
    assert(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count === 1, '幂等命中不会重复创建任务')

    const subtaskCreateResult = await dispatcher.execute({
      id: 'tool-create-subtasks-1',
      name: 'batch_create_tasks',
      args: {
        tasks: [
          {
            title: '整理报告数据',
            parent_id: createdTask.id,
            sort_order: 2,
          },
          {
            title: '撰写报告草稿',
            parent_id: createdTask.id,
            status: 'completed',
            sort_order: 1,
          },
        ],
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    const subtaskData = subtaskCreateResult.data || {}
    assert(subtaskCreateResult.success === true && subtaskData.count === 2, 'batch_create_tasks 可创建父任务下的直接子任务')

    const draftTask = db.prepare('SELECT * FROM tasks WHERE title = ?').get('撰写报告草稿')
    const grandchildCreateResult = await dispatcher.execute({
      id: 'tool-create-grandchild-1',
      name: 'create_task',
      args: {
        title: '补充执行摘要',
        parent_id: draftTask.id,
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    assert(grandchildCreateResult.success === true, 'create_task 可创建二级子任务')

    const listSubtasksResult = await dispatcher.execute({
      id: 'tool-list-subtasks-1',
      name: 'list_subtasks',
      args: {
        taskId: createdTask.id,
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    const listSubtasksData = listSubtasksResult.data || {}
    const listedSubtasks = Array.isArray(listSubtasksData.tasks) ? listSubtasksData.tasks : []
    assert(listSubtasksResult.success === true, 'list_subtasks 可查询子任务')
    assert(listSubtasksData.count === 3, 'list_subtasks 递归返回全部后代子任务', `${listSubtasksData.count || 0} tasks`)
    assert(listSubtasksData.completed === 1, 'list_subtasks 统计已完成子任务')
    assert(
      listedSubtasks.map(task => task.title).join(' > ') === '撰写报告草稿 > 补充执行摘要 > 整理报告数据',
      'list_subtasks 按 sort_order 和树前序排序',
      listedSubtasks.map(task => task.title).join(' > ')
    )
    assert(
      listedSubtasks.some(task => task.title === '补充执行摘要' && task.depth === 2 && Array.isArray(task.parent_chain) && task.parent_chain.includes(draftTask.id)),
      'list_subtasks 返回递归层级和父链'
    )

    const missingSubtasksResult = await dispatcher.execute({
      id: 'tool-list-subtasks-missing-1',
      name: 'list_subtasks',
      args: {
        taskId: 999999,
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    assert(missingSubtasksResult.success === false, 'list_subtasks 拒绝不存在的父任务', missingSubtasksResult.error || '')

    const searchTitleResult = await dispatcher.execute({
      id: 'tool-search-title-1',
      name: 'search_tasks',
      args: {
        query: '季度报告',
        limit: 10,
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    const searchTitleData = searchTitleResult.data || {}
    assert(
      searchTitleResult.success === true && Array.isArray(searchTitleData.tasks) && searchTitleData.tasks.some(task => task.id === createdTask.id),
      'search_tasks 保持标题匹配能力',
      `task_id=${createdTask.id}`
    )

    db.prepare('INSERT INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_timestamp) VALUES (?, ?, ?, ?, ?)')
      .run(createdTask.id, 'smoke-ocr.png', '图片识别文字 相 关 任 务', 'success', new Date().toISOString())
    const searchOcrResult = await dispatcher.execute({
      id: 'tool-search-ocr-1',
      name: 'search_tasks',
      args: {
        query: '相关任务',
        limit: 10,
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    const searchOcrData = searchOcrResult.data || {}
    assert(
      searchOcrResult.success === true && Array.isArray(searchOcrData.tasks) && searchOcrData.tasks.some(task => task.id === createdTask.id),
      'search_tasks 可找到空格分隔 OCR 文本匹配任务',
      `task_id=${createdTask.id}`
    )

    const updateResult = await dispatcher.execute({
      id: 'tool-update-1',
      name: 'update_task',
      args: {
        taskId: createdTask.id,
        status: 'completed',
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    assert(updateResult.success === true, 'update_task 可更新任务状态')
    assert(db.prepare("SELECT status FROM tasks WHERE id = ?").get(createdTask.id).status === 'completed', 'update_task 状态落库')
    assert(db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE event_type = 'task_status_changed'").get().count === 1, 'update_task 状态变更写入账本')

    const queryResult = await dispatcher.execute({
      id: 'tool-query-activity-1',
      name: 'query_activity',
      args: {
        eventTypes: ['task_created', 'task_status_changed'],
        limit: 10,
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    const queryData = queryResult.data || {}
    assert(queryResult.success === true && queryData.count >= 2, 'query_activity 可读活动账本', `${queryData.count || 0} events`)

    const promptBeforeDelete = systemPromptBuilder.build()
    assert(promptBeforeDelete.includes('准备季度报告'), 'SystemPrompt 包含最近任务摘要')

    const deleteResult = await dispatcher.execute({
      id: 'tool-delete-1',
      name: 'delete_task',
      args: {
        taskId: createdTask.id,
        reason: 'smoke test',
      },
    }, {
      sessionId: session.id,
      messageId: assistantMessage.id,
    })
    assert(deleteResult.success === true, 'delete_task 可删除任务')
    assert(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE id = ?').get(createdTask.id).count === 0, 'delete_task 删除 tasks 记录')
    assert(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_id = ?').get(createdTask.id).count === 0, 'delete_task 同步删除子任务记录')
    assert(db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE event_type = 'task_deleted' AND task_id = ?").get(createdTask.id).count === 1, 'delete_task 删除后保留 activity_events')
    assert(Number(db.prepare("SELECT value FROM kv_store WHERE key = 'tasks_write_version'").get().value) >= 3, '写操作持续递增 tasks_write_version')

    const promptAfterDelete = systemPromptBuilder.build()
    assert(!promptAfterDelete.includes('准备季度报告'), 'SystemPrompt 在写版本变化后刷新缓存')

    const integrity = db.pragma('integrity_check', { simple: true })
    assert(integrity === 'ok', '临时 Agent 数据库 integrity_check', String(integrity))
  } finally {
    db.close()
    const resolved = path.resolve(tempDir)
    if (resolved.startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(resolved, { recursive: true, force: true })
    }
  }
}

run()
  .catch(error => {
    fail('Agent smoke 脚本执行', error instanceof Error ? error.stack || error.message : String(error))
  })
  .finally(() => {
    for (const result of results) {
      const detail = result.detail ? ` - ${result.detail}` : ''
      console.log(`[${result.status}] ${result.name}${detail}`)
    }

    const failures = results.filter(result => result.status === 'FAIL')
    console.log('')
    console.log(`Summary: ${results.length - failures.length} passed, ${failures.length} failed`)
    if (failures.length > 0) {
      process.exit(1)
    }
  })
