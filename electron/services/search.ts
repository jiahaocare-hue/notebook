import type Database from 'better-sqlite3'
import type { Task } from '../../src/types'

export interface DateRangeCondition {
  sql: string
  params: string[]
}

export type BuildDateRangeCondition = (
  column: string,
  startDate?: string,
  endDate?: string
) => DateRangeCondition | null

export interface TextSearchOptions {
  limit?: number
  startDate?: string
  endDate?: string
}

export type KeywordMatch = Task & { keyword_match: number }

function limitFromOptions(options?: TextSearchOptions): number {
  return Math.max(1, Math.min(options?.limit || 50, 500))
}

function appendDateRange(
  sql: string,
  params: (string | number)[],
  buildDateRangeCondition: BuildDateRangeCondition,
  options?: TextSearchOptions
): string {
  const dateFilter = buildDateRangeCondition('t.created_at', options?.startDate, options?.endDate)
  if (!dateFilter) {
    return sql
  }

  params.push(...dateFilter.params)
  return `${sql} AND (${dateFilter.sql})`
}

export function searchKeyword(
  db: Database.Database,
  query: string,
  options: TextSearchOptions | undefined,
  buildDateRangeCondition: BuildDateRangeCondition
): Task[] {
  const params: (string | number)[] = [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]
  let sql = `
    SELECT DISTINCT t.*
    FROM tasks t
    LEFT JOIN task_history h ON t.id = h.task_id
    WHERE (t.title LIKE ? OR t.description LIKE ? OR (h.old_value IS NOT NULL AND h.old_value LIKE ?) OR (h.new_value IS NOT NULL AND h.new_value LIKE ?))
  `

  sql = appendDateRange(sql, params, buildDateRangeCondition, options)
  sql += ' ORDER BY t.created_at DESC LIMIT ?'
  params.push(limitFromOptions(options))

  return db.prepare(sql).all(...params) as Task[]
}

export function searchKeywordMatches(
  db: Database.Database,
  query: string,
  options: TextSearchOptions | undefined,
  buildDateRangeCondition: BuildDateRangeCondition
): KeywordMatch[] {
  const params: (string | number)[] = [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]
  let sql = `
    SELECT DISTINCT t.*, 1 as keyword_match
    FROM tasks t
    LEFT JOIN task_history h ON t.id = h.task_id
    WHERE (t.title LIKE ? OR t.description LIKE ? OR (h.old_value IS NOT NULL AND h.old_value LIKE ?) OR (h.new_value IS NOT NULL AND h.new_value LIKE ?))
  `

  sql = appendDateRange(sql, params, buildDateRangeCondition, options)

  return db.prepare(sql).all(...params) as KeywordMatch[]
}

export function searchImageText(
  db: Database.Database,
  query: string,
  options: TextSearchOptions | undefined,
  buildDateRangeCondition: BuildDateRangeCondition
): Task[] {
  const params: (string | number)[] = [`%${query}%`]
  let sql = `
    SELECT DISTINCT t.*
    FROM tasks t
    INNER JOIN image_texts it ON t.id = it.task_id
    WHERE it.text_content LIKE ?
  `

  sql = appendDateRange(sql, params, buildDateRangeCondition, options)
  sql += ' ORDER BY t.created_at DESC LIMIT ?'
  params.push(limitFromOptions(options))

  return db.prepare(sql).all(...params) as Task[]
}
