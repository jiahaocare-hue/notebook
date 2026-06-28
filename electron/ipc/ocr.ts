import { app, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { extractText } from '../services/ocr'
import { logger } from '../services/logger'
import type { DatabaseGetter, ImagePathResolver, MainWindowGetter } from './context'

type OcrHandlersContext = {
  getDb: DatabaseGetter
  getMainWindow: MainWindowGetter
  resolveImageFilePath: ImagePathResolver
}

export function registerOcrHandlers(context: OcrHandlersContext): void {
  ipcMain.handle('ocr:getTaskImageInfo', (_event, taskId: number) => {
    try {
      const stmt = context.getDb()?.prepare('SELECT * FROM image_texts WHERE task_id = ?')
      return stmt?.all(taskId) || []
    } catch (error) {
      logger.error('Failed to get task image OCR info:', error)
      return []
    }
  })

  ipcMain.handle('ocr:getLogs', (_event, options?: number | { limit?: number; offset?: number }) => {
    try {
      const requestedLimit = typeof options === 'number' ? options : options?.limit
      const requestedOffset = typeof options === 'object' ? options.offset : 0
      const logLimit = Math.min(Math.max(requestedLimit || 20, 1), 100)
      const offset = Math.max(requestedOffset || 0, 0)
      const total = (context.getDb()?.prepare('SELECT COUNT(*) as count FROM ocr_logs').get() as { count: number } | undefined)?.count || 0
      const stmt = context.getDb()?.prepare('SELECT * FROM ocr_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?')
      const logs = stmt?.all(logLimit, offset) || []

      if (typeof options === 'number') {
        return logs
      }

      return {
        logs,
        total,
        limit: logLimit,
        offset,
      }
    } catch (error) {
      logger.error('Failed to get OCR logs:', error)
      if (typeof options === 'number') {
        return []
      }
      return {
        logs: [],
        total: 0,
        limit: 20,
        offset: 0,
      }
    }
  })

  ipcMain.handle('ocr:retry', async (_event, taskId: number, imagePath: string) => {
    try {
      const resolvedPath = context.resolveImageFilePath(imagePath)
      if (!resolvedPath.success) {
        return { success: false, error: resolvedPath.error }
      }
      const fullPath = resolvedPath.fullPath

      if (!fs.existsSync(fullPath)) {
        return { success: false, error: 'Image file not found' }
      }

      const ocrResult = await extractText(fullPath, context.getMainWindow())

      context.getDb()?.prepare('INSERT INTO ocr_logs (task_id, image_path, status, message, error) VALUES (?, ?, ?, ?, ?)').run(
        taskId,
        imagePath,
        ocrResult.success ? 'success' : 'failed',
        ocrResult.success ? `閲嶆柊璇嗗埆瀹屾垚锛屾枃瀛楅暱搴? ${ocrResult.text.length}` : null,
        ocrResult.error || null
      )

      const existingRecord = context.getDb()?.prepare('SELECT id FROM image_texts WHERE task_id = ? AND image_path = ?').get(taskId, imagePath)

      if (existingRecord) {
        context.getDb()?.prepare('UPDATE image_texts SET text_content = ?, ocr_status = ?, ocr_error = ?, ocr_timestamp = ? WHERE task_id = ? AND image_path = ?').run(
          ocrResult.text,
          ocrResult.success ? 'success' : 'failed',
          ocrResult.error || null,
          ocrResult.timestamp,
          taskId,
          imagePath
        )
      } else {
        context.getDb()?.prepare('INSERT INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_error, ocr_timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
          taskId,
          imagePath,
          ocrResult.text,
          ocrResult.success ? 'success' : 'failed',
          ocrResult.error || null,
          ocrResult.timestamp
        )
      }

      return { success: true }
    } catch (error) {
      logger.error('Failed to retry OCR:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to retry OCR' }
    }
  })

  ipcMain.handle('log:openFolder', () => {
    const logDir = path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    shell.openPath(logDir)
    return { success: true }
  })
}

