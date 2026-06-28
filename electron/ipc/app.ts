import { app, dialog, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logger } from '../services/logger'
import type { MainWindowGetter } from './context'

type AppHandlersContext = {
  isDev: boolean
  getMainWindow: MainWindowGetter
}

let manualUpdateCheck = false

async function showMessageBox(context: AppHandlersContext, options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const window = context.getMainWindow()
  return window
    ? dialog.showMessageBox(window, options)
    : dialog.showMessageBox(options)
}

export function registerAutoUpdaterLifecycle(context: AppHandlersContext): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    showMessageBox(context, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否前往下载？`,
      buttons: ['前往下载', '稍后提醒'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        shell.openExternal('https://github.com/jiahaocare-hue/notebook/releases/latest')
      }
    })
  })

  autoUpdater.on('update-not-available', () => {
    if (manualUpdateCheck) {
      showMessageBox(context, {
        type: 'info',
        title: '检查更新',
        message: '当前已经是最新版本',
        buttons: ['确定']
      })
      manualUpdateCheck = false
    }
  })

  autoUpdater.on('error', (error) => {
    logger.error('Auto updater error:', error)
    if (manualUpdateCheck) {
      showMessageBox(context, {
        type: 'error',
        title: '检查更新失败',
        message: '检查更新时发生错误，请稍后重试',
        buttons: ['确定']
      })
      manualUpdateCheck = false
    }
  })

  if (!context.isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates()
    }, 3000)
  }
}

export function registerAppHandlers(context: AppHandlersContext): void {
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:checkForUpdates', async () => {
    if (context.isDev) {
      showMessageBox(context, {
        type: 'info',
        title: '检查更新',
        message: '开发模式下无法检查更新',
        buttons: ['确定']
      })
      return { success: false, error: '开发模式下无法检查更新' }
    }

    manualUpdateCheck = true
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (error) {
      manualUpdateCheck = false
      return { success: false, error: error instanceof Error ? error.message : '检查更新失败' }
    }
  })
}

