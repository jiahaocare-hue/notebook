import { ipcMain } from 'electron'
import { generateEmbedding, cosineSimilarity } from '../services/embedding'
import { searchImageText, searchKeyword, searchKeywordMatches } from '../services/search'
import { buildDateRangeCondition } from '../services/query'
import { logger } from '../services/logger'
import type { DatabaseGetter } from './context'

type SearchHandlersContext = {
  getDb: DatabaseGetter
  parseEmbeddingVector: (taskId: number, embedding: string) => number[]
}

type TaskWithEmbedding = {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  parent_id: number | null
  sort_order: number
  created_at: string
  updated_at: string
  embedding: string
}

export function registerSearchHandlers(context: SearchHandlersContext): void {
  ipcMain.handle('search:keyword', (_event, query: string, options?: { fields?: string[]; limit?: number; startDate?: string; endDate?: string }) => {
    const db = context.getDb()
    if (!db) {
      return []
    }

    const results = searchKeyword(db, query, options, buildDateRangeCondition)
    logger.debug('[search:keyword] Results count:', results.length)
    return results
  })

  ipcMain.handle('search:semantic', async (_event, query: string, options?: { limit?: number; threshold?: number; startDate?: string; endDate?: string }) => {
    const limit = options?.limit || 50
    const threshold = options?.threshold || 0.7

    try {
      const queryEmbedding = await generateEmbedding(query)

      let sql = `
        SELECT t.*, e.embedding
        FROM tasks t
        LEFT JOIN task_embeddings e ON t.id = e.task_id
        WHERE e.embedding IS NOT NULL
      `
      const params: string[] = []

      const dateFilter = buildDateRangeCondition('t.created_at', options?.startDate, options?.endDate)
      if (dateFilter) {
        sql += ` AND (${dateFilter.sql})`
        params.push(...dateFilter.params)
      }

      const tasksWithEmbeddings = context.getDb()?.prepare(sql).all(...params) as TaskWithEmbedding[] || []

      const results = tasksWithEmbeddings
        .map(task => {
          const taskEmbedding = context.parseEmbeddingVector(task.id, task.embedding)
          const similarity = cosineSimilarity(queryEmbedding, taskEmbedding)
          return {
            ...task,
            embedding: undefined,
            similarity
          }
        })
        .filter(task => task.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)

      return { tasks: results }
    } catch (error) {
      logger.error('Semantic search error:', error)
      return {
        error: error instanceof Error ? error.message : 'Failed to perform semantic search',
        tasks: []
      }
    }
  })

  ipcMain.handle('search:hybrid', async (_event, query: string, options?: { limit?: number; keywordWeight?: number; threshold?: number; startDate?: string; endDate?: string }) => {
    logger.debug('[search:hybrid] Starting search, query:', query)
    const limit = options?.limit || 50
    const keywordWeight = options?.keywordWeight || 0.3
    const semanticWeight = 1 - keywordWeight
    const threshold = options?.threshold || 0.7

    try {
      logger.debug('[search:hybrid] Generating embedding for query...')
      const queryEmbedding = await generateEmbedding(query)
      logger.debug('[search:hybrid] Embedding generated, dimension:', queryEmbedding.length)

      const db = context.getDb()
      const keywordResults = db ? searchKeywordMatches(db, query, options, buildDateRangeCondition) : []
      logger.debug('[search:hybrid] Keyword results count:', keywordResults?.length || 0)
      if (keywordResults && keywordResults.length > 0) {
        logger.debug('[search:hybrid] Keyword result IDs:', keywordResults.map(r => r.id).join(', '))
      }

      let embeddingSql = `
        SELECT t.*, e.embedding
        FROM tasks t
        LEFT JOIN task_embeddings e ON t.id = e.task_id
        WHERE e.embedding IS NOT NULL
      `
      const embeddingParams: string[] = []

      const embeddingDateFilter = buildDateRangeCondition('t.created_at', options?.startDate, options?.endDate)
      if (embeddingDateFilter) {
        embeddingSql += ` AND (${embeddingDateFilter.sql})`
        embeddingParams.push(...embeddingDateFilter.params)
      }

      const tasksWithEmbeddings = context.getDb()?.prepare(embeddingSql).all(...embeddingParams) as TaskWithEmbedding[] || []

      const keywordMatchSet = new Set(keywordResults.map(t => t.id))

      const semanticResults = tasksWithEmbeddings.map(task => {
        const taskEmbedding = context.parseEmbeddingVector(task.id, task.embedding)
        const similarity = cosineSimilarity(queryEmbedding, taskEmbedding)
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          due_date: task.due_date,
          parent_id: task.parent_id,
          sort_order: task.sort_order,
          created_at: task.created_at,
          updated_at: task.updated_at,
          similarity,
          keywordMatch: keywordMatchSet.has(task.id) ? 1 : 0
        }
      })

      const combinedResults = semanticResults
        .map(task => ({
          ...task,
          combinedScore: task.keywordMatch * keywordWeight + task.similarity * semanticWeight
        }))
        .filter(task => task.keywordMatch === 1 || task.similarity >= threshold)
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit)

      return { tasks: combinedResults }
    } catch (error) {
      logger.error('[search:hybrid] Search failed:', error)
      logger.error('[search:hybrid] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      return {
        error: error instanceof Error ? error.message : 'Failed to perform hybrid search',
        tasks: []
      }
    }
  })

  ipcMain.handle('search:image', (_event, query: string, options?: { limit?: number; startDate?: string; endDate?: string }) => {
    const db = context.getDb()
    if (!db) {
      return []
    }

    return searchImageText(db, query, options, buildDateRangeCondition)
  })
}

