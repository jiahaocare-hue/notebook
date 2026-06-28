import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDefaultDataDir, loadConfig, maskApiKey, resolveIncomingApiKey, saveConfig } from '../services/config'
import { logger } from '../services/logger'

type ConfigHandlersContext = {
  isDev: boolean
  appRootDir: string
  getActiveDataDir: () => string
}

export function registerConfigHandlers(context: ConfigHandlersContext): void {
  ipcMain.handle('config:get', () => {
    const config = loadConfig()
    return {
      dataDir: context.getActiveDataDir(),
      customDataDir: config.dataDir || null
    }
  })

  ipcMain.handle('config:setDataDir', (_event, dataDir: string | null) => {
    try {
      const config = loadConfig()
      const currentDataDir = context.getActiveDataDir()
      const defaultDataDir = getDefaultDataDir(context.isDev, context.appRootDir)
      const nextDataDir = dataDir || defaultDataDir

      if (dataDir) {
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true })
        }
        config.dataDir = dataDir
      } else {
        delete config.dataDir
      }

      const saved = saveConfig(config)
      return {
        success: saved,
        requiresRestart: saved && path.resolve(nextDataDir) !== path.resolve(currentDataDir),
        activeDataDir: currentDataDir,
        pendingDataDir: nextDataDir
      }
    } catch (error) {
      logger.error('Failed to set data directory:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to set data directory' }
    }
  })

  ipcMain.handle('config:setApiKey', (_event, apiKey: string) => {
    try {
      const config = loadConfig()
      const nextApiKey = resolveIncomingApiKey(config.llm?.apiKey, apiKey)
      config.llm = {
        ...config.llm,
        apiKey: nextApiKey
      }
      return saveConfig(config)
    } catch (error) {
      logger.error('Failed to set API key:', error)
      return false
    }
  })

  ipcMain.handle('config:getApiKey', () => {
    const config = loadConfig()
    return maskApiKey(config.llm?.apiKey)
  })
}

