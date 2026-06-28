import { ipcMain, dialog } from 'electron'
import type { OpenDialogOptions } from 'electron'
import type { MainWindowGetter } from './context'

type DialogHandlersContext = {
  getMainWindow: MainWindowGetter
}

export function registerDialogHandlers(context: DialogHandlersContext): void {
  ipcMain.handle('dialog:openDirectory', async () => {
    const options: OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      title: '閫夋嫨鏁版嵁瀛樺偍鐩綍'
    }
    const window = context.getMainWindow()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, filePath: null }
    }

    return { canceled: false, filePath: result.filePaths[0] }
  })

  ipcMain.handle('window:focus', () => {
    const window = context.getMainWindow()
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) {
        window.restore()
      }
      window.focus()
      window.webContents.focus()
    }
    return true
  })

  ipcMain.handle('dialog:confirm', async (_event, message: string) => {
    const options = {
      type: 'question' as const,
      buttons: ['鍙栨秷', '纭畾'],
      defaultId: 1,
      cancelId: 0,
      message
    }
    const window = context.getMainWindow()
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options)
    return result.response === 1
  })
}
