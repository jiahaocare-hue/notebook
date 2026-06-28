import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { extractText } from '../services/ocr'
import { loadImageAsDataUrl } from '../services/images'
import { logger } from '../services/logger'
import type { DatabaseGetter, ImagePathResolver, MainWindowGetter } from './context'

type ImageHandlersContext = {
  getDb: DatabaseGetter
  getImagesDir: () => string
  getMainWindow: MainWindowGetter
  resolveImageFilePath: ImagePathResolver
}

export function registerImageHandlers(context: ImageHandlersContext): void {
  ipcMain.handle('image:save', async (_event, imageData: string, fileName: string, taskId?: number) => {
    try {
      const imagesDir = context.getImagesDir()
      const timestamp = Date.now()
      const ext = path.extname(fileName) || '.png'
      const uniqueName = `${timestamp}_${Math.random().toString(36).substr(2, 9)}${ext}`
      const filePath = path.join(imagesDir, uniqueName)

      logger.debug('[image:save] Saving file:', uniqueName)
      logger.debug('[image:save] Full path:', filePath)

      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(filePath, buffer)

      logger.debug('[image:save] Image file saved:', uniqueName)

      try {
        logger.debug('[image:save] Calling extractText...')
        const ocrResult = await extractText(filePath, context.getMainWindow())
        logger.debug('[image:save] extractText returned, success:', ocrResult.success, 'text length:', ocrResult.text?.length)

        logger.debug('[image:save] Inserting into ocr_logs...')
        context.getDb()?.prepare('INSERT INTO ocr_logs (task_id, image_path, status, message, error) VALUES (?, ?, ?, ?, ?)').run(
          taskId || null,
          uniqueName,
          ocrResult.success ? 'success' : 'failed',
          ocrResult.success ? `璇嗗埆瀹屾垚锛屾枃瀛楅暱搴? ${ocrResult.text.length}` : null,
          ocrResult.error || null
        )
        logger.debug('[image:save] ocr_logs insert done')

        if (ocrResult.success && ocrResult.text) {
          logger.debug('[image:save] Inserting into image_texts (success)...')
          context.getDb()?.prepare('INSERT INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_timestamp) VALUES (?, ?, ?, ?, ?)').run(
            taskId || null,
            uniqueName,
            ocrResult.text,
            'success',
            ocrResult.timestamp
          )
          logger.info(`[image:save] OCR completed for task ${taskId || 'new'}, text length: ${ocrResult.text.length}`)
        } else {
          logger.debug('[image:save] Inserting into image_texts (failed)...')
          context.getDb()?.prepare('INSERT INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_error, ocr_timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
            taskId || null,
            uniqueName,
            '',
            'failed',
            ocrResult.error || 'Unknown error',
            ocrResult.timestamp
          )
          logger.warn(`[image:save] OCR failed for image: ${uniqueName}, error: ${ocrResult.error}`)
        }
      } catch (ocrError) {
        logger.error('[image:save] OCR execution failed (image still saved):', ocrError)
        context.getDb()?.prepare('INSERT INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_error, ocr_timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
          taskId || null,
          uniqueName,
          '',
          'failed',
          ocrError instanceof Error ? ocrError.message : 'OCR execution failed',
          new Date().toISOString()
        )
      }

      logger.debug('[image:save] Returning:', { success: true, path: uniqueName })
      return { success: true, path: uniqueName }
    } catch (error) {
      logger.error('Failed to save image:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save image' }
    }
  })

  ipcMain.handle('image:load', (_event, imagePath: string) => {
    try {
      return loadImageAsDataUrl(context.getImagesDir(), imagePath)
    } catch (error) {
      logger.error('Failed to load image:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load image' }
    }
  })

  ipcMain.handle('image:delete', (_event, imagePath: string) => {
    try {
      const resolvedPath = context.resolveImageFilePath(imagePath)
      if (!resolvedPath.success) {
        return { success: false, error: resolvedPath.error }
      }
      const fullPath = resolvedPath.fullPath

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath)
      }

      return { success: true }
    } catch (error) {
      logger.error('Failed to delete image:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete image' }
    }
  })
}

