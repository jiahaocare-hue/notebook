import { ipcMain } from 'electron'
import fs from 'fs'
import {
  SQLITE_VARIABLE_BATCH_SIZE,
  buildPlaceholders,
  buildTaskDateFilter,
  chunkArray,
  getDateFieldFromMode,
  uniquePositiveIds,
} from '../services/query'
import { extractLocalImagePaths } from '../services/images'
import { buildDateRangeCondition } from '../services/query'
import { logger } from '../services/logger'
import type { DatabaseGetter, ImagePathResolver } from './context'

type TaskHandlersContext = {
  getDb: DatabaseGetter
  resolveImageFilePath: ImagePathResolver
  updateTaskEmbedding: (taskId: number, title: string, description: string | null) => Promise<void>
}

type TaskRow = {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  parent_id: number | null
  sort_order: number
  created_at?: string
  updated_at?: string
}

function addHistoryRecord(context: TaskHandlersContext, taskId: number, action: string, oldValue: string | null, newValue: string | null): void {
  const stmt = context.getDb()?.prepare('INSERT INTO task_history (task_id, action, old_value, new_value) VALUES (?, ?, ?, ?)')
  stmt?.run(taskId, action, oldValue, newValue)
}

function queryByIdsInChunks<T>(
  context: TaskHandlersContext,
  ids: number[],
  createSql: (placeholders: string) => string
): T[] {
  return chunkArray(ids).flatMap(chunk => {
    const stmt = context.getDb()?.prepare(createSql(buildPlaceholders(chunk.length)))
    return stmt?.all(...chunk) as T[] || []
  })
}

export function registerTaskHandlers(context: TaskHandlersContext): void {
  ipcMain.handle('task:create', async (_event, task: { title: string; description?: string; status?: string; priority?: string; due_date?: string; parent_id?: number; sort_order?: number }) => {
    const stmt = context.getDb()?.prepare('INSERT INTO tasks (title, description, status, priority, due_date, parent_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const result = stmt?.run(task.title, task.description || null, task.status || 'in_progress', task.priority || 'medium', task.due_date || null, task.parent_id !== undefined ? task.parent_id : null, task.sort_order || 0)
    const taskId = result?.lastInsertRowid as number

    if (taskId) {
      addHistoryRecord(context, taskId, 'created', null, JSON.stringify({ title: task.title, description: task.description, status: task.status || 'in_progress', priority: task.priority || 'medium', due_date: task.due_date, parent_id: task.parent_id !== undefined ? task.parent_id : null }))
      context.updateTaskEmbedding(taskId, task.title, task.description || null).catch(err => logger.error('Failed to generate embedding:', err))

      if (task.description) {
        for (const imagePath of extractLocalImagePaths(task.description)) {
          context.getDb()?.prepare('UPDATE image_texts SET task_id = ? WHERE image_path = ? AND (task_id IS NULL OR task_id = 0)').run(taskId, imagePath)
        }
      }
    }

    return taskId
  })

  ipcMain.handle('task:update', async (_event, taskId: number, task: { title?: string; description?: string; status?: string; priority?: string; due_date?: string; parent_id?: number | null; sort_order?: number }) => {
    const getStmt = context.getDb()?.prepare('SELECT * FROM tasks WHERE id = ?')
    const oldTask = getStmt?.get(taskId) as TaskRow | undefined

    if (!oldTask) {
      return false
    }

    const updates: string[] = []
    const values: (string | null)[] = []
    const changes: { old: Record<string, unknown>; new: Record<string, unknown> } = { old: {}, new: {} }

    if (task.title !== undefined && task.title !== oldTask.title) {
      updates.push('title = ?')
      values.push(task.title)
      changes.old.title = oldTask.title
      changes.new.title = task.title
    }

    if (task.description !== undefined && task.description !== oldTask.description) {
      updates.push('description = ?')
      values.push(task.description)
      changes.old.description = oldTask.description
      changes.new.description = task.description
    }

    if (task.status !== undefined && task.status !== oldTask.status) {
      updates.push('status = ?')
      values.push(task.status)
      changes.old.status = oldTask.status
      changes.new.status = task.status
    }

    if (task.priority !== undefined && task.priority !== oldTask.priority) {
      updates.push('priority = ?')
      values.push(task.priority)
      changes.old.priority = oldTask.priority
      changes.new.priority = task.priority
    }

    if (task.due_date !== undefined && task.due_date !== oldTask.due_date) {
      updates.push('due_date = ?')
      values.push(task.due_date || null)
      changes.old.due_date = oldTask.due_date
      changes.new.due_date = task.due_date
    }

    if (task.parent_id !== undefined && task.parent_id !== oldTask.parent_id) {
      updates.push('parent_id = ?')
      values.push(task.parent_id === null ? null : String(task.parent_id))
      changes.old.parent_id = oldTask.parent_id
      changes.new.parent_id = task.parent_id
    }

    if (task.sort_order !== undefined && task.sort_order !== oldTask.sort_order) {
      updates.push('sort_order = ?')
      values.push(String(task.sort_order))
      changes.old.sort_order = oldTask.sort_order
      changes.new.sort_order = task.sort_order
    }

    if (updates.length === 0) {
      return true
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    values.push(String(taskId))

    const updateStmt = context.getDb()?.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`)
    updateStmt?.run(...values)

    const action = task.status !== undefined && task.status !== oldTask.status ? 'status_changed' : 'updated'
    logger.debug('[task:update] Adding history record, action:', action, 'changes:', JSON.stringify(changes))
    addHistoryRecord(context, taskId, action, JSON.stringify(changes.old), JSON.stringify(changes.new))

    if (task.title !== undefined || task.description !== undefined) {
      const newTitle = task.title !== undefined ? task.title : oldTask.title
      const newDescription = task.description !== undefined ? task.description : oldTask.description
      context.updateTaskEmbedding(taskId, newTitle, newDescription).catch(err => logger.error('Failed to generate embedding:', err))
    }

    return true
  })

  ipcMain.handle('task:delete', (_event, taskId: number) => {
    try {
      const getStmt = context.getDb()?.prepare('SELECT * FROM tasks WHERE id = ?')
      const task = getStmt?.get(taskId) as TaskRow | undefined

      if (!task) {
        return false
      }

      const imageFiles: string[] = []

      if (task.description) {
        imageFiles.push(...extractLocalImagePaths(task.description))
      }

      try {
        const deleteTransaction = context.getDb()?.transaction(() => {
          const collectSubtaskIds = (parentId: number): number[] => {
            const subtasks = context.getDb()?.prepare('SELECT id FROM tasks WHERE parent_id = ?').all(parentId) as { id: number }[] || []
            let ids: number[] = []
            for (const subtask of subtasks) {
              ids.push(subtask.id)
              ids = ids.concat(collectSubtaskIds(subtask.id))
            }
            return ids
          }

          const subtaskIds = collectSubtaskIds(taskId)
          const allIdsToDelete = [taskId, ...subtaskIds]

          try {
            for (const id of allIdsToDelete) {
              const subtask = context.getDb()?.prepare('SELECT description FROM tasks WHERE id = ?').get(id) as { description: string | null } | undefined
              if (subtask?.description) {
                imageFiles.push(...extractLocalImagePaths(subtask.description))
              }
              context.getDb()?.prepare('DELETE FROM task_embeddings WHERE task_id = ?').run(id)
              context.getDb()?.prepare('DELETE FROM task_history WHERE task_id = ?').run(id)
              context.getDb()?.prepare('DELETE FROM image_texts WHERE task_id = ?').run(id)
              context.getDb()?.prepare('DELETE FROM tasks WHERE id = ?').run(id)
            }
          } catch (innerError) {
            logger.error('Database transaction error during task deletion:', innerError)
            throw innerError
          }
        })

        deleteTransaction?.()
      } catch (transactionError) {
        logger.error('Failed to delete task from database:', transactionError)
        return false
      }

      for (const imageFile of imageFiles) {
        const resolvedPath = context.resolveImageFilePath(imageFile)
        if (resolvedPath.success && fs.existsSync(resolvedPath.fullPath)) {
          try {
            fs.unlinkSync(resolvedPath.fullPath)
          } catch (e) {
            logger.error('Failed to delete image file:', resolvedPath.fullPath, e)
          }
        }
      }

      return true
    } catch (error) {
      logger.error('Failed to delete task:', error)
      return false
    }
  })

  ipcMain.handle('task:get', (_event, taskId: number) => {
    const stmt = context.getDb()?.prepare('SELECT * FROM tasks WHERE id = ?')
    return stmt?.get(taskId)
  })

  ipcMain.handle('task:getMany', (_event, taskIds: number[]) => {
    const uniqueIds = uniquePositiveIds(taskIds)
    if (uniqueIds.length === 0) {
      return []
    }

    return queryByIdsInChunks(context, uniqueIds, placeholders => `SELECT * FROM tasks WHERE id IN (${placeholders})`)
  })

  ipcMain.handle('task:list', (_event, filters?: { date?: string; status?: string; startDate?: string; endDate?: string; dateFilterMode?: string }) => {
    let sql = 'SELECT * FROM tasks WHERE 1=1 AND parent_id IS NULL'
    const params: string[] = []
    const dateField = getDateFieldFromMode(filters?.dateFilterMode)

    if (filters?.status) {
      sql += ' AND status = ?'
      params.push(filters.status)
    }

    const dateFilter = buildTaskDateFilter(dateField, filters)
    if (dateFilter) {
      sql += ` AND (${dateFilter.sql})`
      params.push(...dateFilter.params)
    }

    sql += ' ORDER BY created_at DESC'

    const stmt = context.getDb()?.prepare(sql)
    return stmt?.all(...params) || []
  })

  ipcMain.handle('task:listWithHistory', (_event, filters?: { startDate?: string; endDate?: string; dateFilterMode?: string }) => {
    let sql = 'SELECT * FROM tasks WHERE 1=1 AND parent_id IS NULL'
    const params: string[] = []
    const dateField = getDateFieldFromMode(filters?.dateFilterMode)

    const dateFilter = buildTaskDateFilter(dateField, filters)
    if (dateFilter) {
      sql += ` AND (${dateFilter.sql})`
      params.push(...dateFilter.params)
    }

    sql += ' ORDER BY created_at DESC'

    const stmt = context.getDb()?.prepare(sql)
    const tasks = stmt?.all(...params) as TaskRow[] || []

    if (tasks.length === 0) {
      return []
    }

    const historyRows = queryByIdsInChunks<{ task_id: number }>(context, tasks.map(task => task.id), placeholders => `
      SELECT *
      FROM task_history
      WHERE task_id IN (${placeholders})
      ORDER BY timestamp DESC
    `)

    const historyByTaskId = historyRows.reduce<Record<number, { task_id: number }[]>>((acc, history) => {
      if (!acc[history.task_id]) {
        acc[history.task_id] = []
      }
      acc[history.task_id].push(history)
      return acc
    }, {})

    return tasks.map(task => ({
      ...task,
      history: historyByTaskId[task.id] || []
    }))
  })

  ipcMain.handle('task:getCounts', (_event, filters?: { date?: string; startDate?: string; endDate?: string; dateFilterMode?: string }) => {
    let sql = 'SELECT status, COUNT(*) as count FROM tasks WHERE parent_id IS NULL'
    const conditions: string[] = []
    const params: string[] = []
    const dateField = getDateFieldFromMode(filters?.dateFilterMode)

    const dateFilter = buildTaskDateFilter(dateField, filters)
    if (dateFilter) {
      conditions.push(`(${dateFilter.sql})`)
      params.push(...dateFilter.params)
    }

    if (conditions.length > 0) {
      sql += ' AND ' + conditions.join(' AND ')
    }

    sql += ' GROUP BY status'

    const stmt = context.getDb()?.prepare(sql)
    const results = stmt?.all(...params) as { status: string; count: number }[] || []

    const counts = {
      all: 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0
    }

    for (const row of results) {
      counts.all += row.count
      if (row.status === 'pending') counts.pending = row.count
      else if (row.status === 'in_progress') counts.in_progress = row.count
      else if (row.status === 'completed') counts.completed = row.count
      else if (row.status === 'cancelled') counts.cancelled = row.count
    }

    return counts
  })

  ipcMain.handle('task:getSummaryStats', (_event, filters?: { startDate?: string; endDate?: string; dateFilterMode?: string; bucket?: 'day' | 'month' }) => {
    const dateField = getDateFieldFromMode(filters?.dateFilterMode)
    const dateFilter = buildTaskDateFilter(dateField, filters)
    const whereClauses = ['parent_id IS NULL']
    const whereParams: string[] = []

    if (dateFilter) {
      whereClauses.push(`(${dateFilter.sql})`)
      whereParams.push(...dateFilter.params)
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`
    const statusRows = context.getDb()?.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks
      ${whereSql}
      GROUP BY status
    `).all(...whereParams) as { status: string; count: number }[] || []

    const priorityRows = context.getDb()?.prepare(`
      SELECT priority, COUNT(*) as count
      FROM tasks
      ${whereSql}
      GROUP BY priority
    `).all(...whereParams) as { priority: string; count: number }[] || []

    const avgRow = context.getDb()?.prepare(`
      SELECT AVG(julianday(updated_at) - julianday(created_at)) as avgCompletionTime
      FROM tasks
      ${whereSql} AND status = 'completed' AND created_at IS NOT NULL AND updated_at IS NOT NULL
    `).get(...whereParams) as { avgCompletionTime: number | null } | undefined

    const bucketField = filters?.dateFilterMode === 'updated' || filters?.dateFilterMode === 'created_or_updated'
      ? 'updated_at'
      : 'created_at'
    const bucketExpression = filters?.bucket === 'month'
      ? `strftime('%Y-%m', ${bucketField}, 'localtime')`
      : `date(${bucketField}, 'localtime')`
    const distributionClauses = [...whereClauses]
    const distributionParams = [...whereParams]
    const bucketRangeFilter = buildDateRangeCondition(bucketField, filters?.startDate, filters?.endDate)

    if (bucketRangeFilter) {
      distributionClauses.push(`(${bucketRangeFilter.sql})`)
      distributionParams.push(...bucketRangeFilter.params)
    }

    const distributionRows = context.getDb()?.prepare(`
      SELECT ${bucketExpression} as month, COUNT(*) as count
      FROM tasks
      WHERE ${distributionClauses.join(' AND ')}
      GROUP BY month
      ORDER BY month ASC
    `).all(...distributionParams) as { month: string; count: number }[] || []

    const counts = {
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
      cancelled: 0
    }

    for (const row of statusRows) {
      counts.total += row.count
      if (row.status === 'completed') counts.completed = row.count
      else if (row.status === 'in_progress') counts.inProgress = row.count
      else if (row.status === 'pending') counts.pending = row.count
      else if (row.status === 'cancelled') counts.cancelled = row.count
    }

    const priorityDistribution = {
      high: 0,
      medium: 0,
      low: 0
    }

    for (const row of priorityRows) {
      if (row.priority === 'high') priorityDistribution.high = row.count
      else if (row.priority === 'medium') priorityDistribution.medium = row.count
      else if (row.priority === 'low') priorityDistribution.low = row.count
    }

    return {
      ...counts,
      completionRate: counts.total > 0 ? (counts.completed / counts.total) * 100 : 0,
      avgCompletionTime: avgRow?.avgCompletionTime ?? undefined,
      priorityDistribution,
      monthlyDistribution: distributionRows.filter(row => row.month)
    }
  })

  ipcMain.handle('task:earliest-date', () => {
    const result = context.getDb()?.prepare("SELECT date(MIN(created_at), 'localtime') as earliest_date FROM tasks WHERE parent_id IS NULL").get() as { earliest_date: string | null } | undefined
    if (result?.earliest_date) {
      return result.earliest_date
    }
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  ipcMain.handle('task:listSubtasks', (_event, parentId: number) => {
    const stmt = context.getDb()?.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY sort_order ASC, created_at ASC')
    return stmt?.all(parentId) || []
  })

  ipcMain.handle('task:getSubtaskCounts', (_event, taskId: number) => {
    const total = (context.getDb()?.prepare('SELECT COUNT(*) as count FROM tasks WHERE parent_id = ?').get(taskId) as { count: number } | undefined)?.count || 0
    const completed = (context.getDb()?.prepare("SELECT COUNT(*) as count FROM tasks WHERE parent_id = ? AND status = 'completed'").get(taskId) as { count: number } | undefined)?.count || 0
    return { total, completed }
  })

  ipcMain.handle('task:getSubtaskCountsBatch', (_event, taskIds: number[]) => {
    const uniqueIds = uniquePositiveIds(taskIds)
    if (uniqueIds.length === 0) {
      return {}
    }

    const rows = queryByIdsInChunks<{ taskId: number; total: number; completed: number | null }>(context, uniqueIds, placeholders => `
      SELECT
        parent_id as taskId,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM tasks
      WHERE parent_id IN (${placeholders})
      GROUP BY parent_id
    `)

    return rows.reduce<Record<number, { total: number; completed: number }>>((acc, row) => {
      acc[row.taskId] = {
        total: row.total,
        completed: row.completed || 0
      }
      return acc
    }, {})
  })

  ipcMain.handle('task:getActivityTimeline', (_event, taskId: number, options?: { limit?: number; offset?: number }) => {
    const limit = options?.limit ?? 20
    const offset = options?.offset ?? 0

    const subtasks = context.getDb()?.prepare('SELECT id, title, parent_id FROM tasks WHERE parent_id = ?').all(taskId) as { id: number; title: string; parent_id: number | null }[] || []

    const allTaskIds = uniquePositiveIds([taskId, ...subtasks.map(s => s.id)])
    if (allTaskIds.length === 0) {
      return []
    }

    let records: Record<string, any>[]
    if (allTaskIds.length <= SQLITE_VARIABLE_BATCH_SIZE - 2) {
      const placeholders = buildPlaceholders(allTaskIds.length)
      const sql = `SELECT h.*, t.title as task_title, t.parent_id as task_parent_id FROM task_history h LEFT JOIN tasks t ON h.task_id = t.id WHERE h.task_id IN (${placeholders}) ORDER BY h.timestamp DESC LIMIT ? OFFSET ?`
      const stmt = context.getDb()?.prepare(sql)
      records = stmt?.all(...allTaskIds, limit, offset) as Record<string, any>[] || []
    } else {
      records = queryByIdsInChunks<Record<string, any>>(context, allTaskIds, placeholders => `
        SELECT h.*, t.title as task_title, t.parent_id as task_parent_id
        FROM task_history h
        LEFT JOIN tasks t ON h.task_id = t.id
        WHERE h.task_id IN (${placeholders})
      `)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(offset, offset + limit)
    }

    return records.map(record => ({
      id: record.id,
      task_id: record.task_id,
      action: record.action,
      old_value: record.old_value,
      new_value: record.new_value,
      timestamp: record.timestamp,
      source_task_id: record.task_id,
      source_task_title: record.task_title || '',
      source_parent_id: record.task_parent_id ?? null
    }))
  })

  ipcMain.handle('history:getByTaskId', (_event, taskId: number, options?: { limit?: number; offset?: number }) => {
    const limit = options?.limit ?? 20
    const offset = options?.offset ?? 0
    const stmt = context.getDb()?.prepare('SELECT * FROM task_history WHERE task_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?')
    return stmt?.all(taskId, limit, offset) || []
  })

  ipcMain.handle('history:delete', (_event, historyId: number) => {
    try {
      context.getDb()?.prepare('DELETE FROM task_history WHERE id = ?').run(historyId)
      return true
    } catch (error) {
      logger.error('Failed to delete history record:', error)
      return false
    }
  })

  ipcMain.handle('history:update', (_event, historyId: number, newValue: string) => {
    try {
      context.getDb()?.prepare('UPDATE task_history SET new_value = ? WHERE id = ?').run(newValue, historyId)
      return true
    } catch (error) {
      logger.error('Failed to update history record:', error)
      return false
    }
  })
}

