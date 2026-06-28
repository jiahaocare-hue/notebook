import { clipboard, dialog, ipcMain, nativeImage } from 'electron'
import fs from 'fs'
import { logger } from '../services/logger'
import type { MainWindowGetter } from './context'

type FileHandlersContext = {
  getMainWindow: MainWindowGetter
}

export function registerFileHandlers(context: FileHandlersContext): void {
  ipcMain.handle('file:save', async (_event, options: { defaultPath: string; filters: { name: string; extensions: string[] }[]; content: string }) => {
    const dialogOptions = {
      defaultPath: options.defaultPath,
      filters: options.filters,
      title: '淇濆瓨鏂囦欢'
    }
    const window = context.getMainWindow()
    const result = window
      ? await dialog.showSaveDialog(window, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)

    if (result.canceled || !result.filePath) {
      return { success: false, cancelled: true }
    }

    try {
      fs.writeFileSync(result.filePath, options.content, 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (error) {
      logger.error('Failed to save file:', error)
      return { success: false, error: error instanceof Error ? error.message : '淇濆瓨鏂囦欢澶辫触' }
    }
  })

  ipcMain.handle('file:saveBinary', async (_event, options: { defaultPath: string; filters: { name: string; extensions: string[] }[]; content: number[] }) => {
    const dialogOptions = {
      defaultPath: options.defaultPath,
      filters: options.filters,
      title: '淇濆瓨鏂囦欢'
    }
    const window = context.getMainWindow()
    const result = window
      ? await dialog.showSaveDialog(window, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)

    if (result.canceled || !result.filePath) {
      return { success: false, cancelled: true }
    }

    try {
      const buffer = Buffer.from(options.content)
      fs.writeFileSync(result.filePath, buffer)
      return { success: true, filePath: result.filePath }
    } catch (error) {
      logger.error('Failed to save binary file:', error)
      return { success: false, error: error instanceof Error ? error.message : '淇濆瓨鏂囦欢澶辫触' }
    }
  })

  ipcMain.handle('clipboard:writeImage', (_event, imageData: string) => {
    try {
      const image = nativeImage.createFromDataURL(imageData)

      if (image.isEmpty()) {
        return { success: false, error: '鏃犳硶鍒涘缓鍥剧墖' }
      }

      clipboard.writeImage(image)
      return { success: true }
    } catch (error) {
      logger.error('Failed to write image to clipboard:', error)
      return { success: false, error: error instanceof Error ? error.message : '澶嶅埗鍥剧墖澶辫触' }
    }
  })

  ipcMain.handle('clipboard:readImage', async () => {
    try {
      const image = clipboard.readImage()

      if (image.isEmpty()) {
        return { image: null, error: '鍓创鏉夸腑娌℃湁鍥剧墖' }
      }

      const dataUrl = image.toDataURL()
      return { image: dataUrl }
    } catch (error) {
      logger.error('Failed to read image from clipboard:', error)
      return { image: null, error: error instanceof Error ? error.message : '璇诲彇鍥剧墖澶辫触' }
    }
  })
}

