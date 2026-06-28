import { ipcMain } from 'electron'
import { generateSummary, SummaryRequest } from '../services/llm'
import { loadConfig, maskApiKey, resolveIncomingApiKey, saveConfig } from '../services/config'
import { logger } from '../services/logger'

export function registerLlmHandlers(): void {
  ipcMain.handle('llm:getConfig', () => {
    const config = loadConfig()
    return {
      apiKey: maskApiKey(config.llm?.apiKey),
      baseUrl: config.llm?.baseUrl || null,
      model: config.llm?.model || null,
      timeout: config.llm?.timeout || 30,
      verifySSL: config.llm?.verifySSL !== false,
      promptTemplate: config.llm?.promptTemplate || null
    }
  })

  ipcMain.handle('llm:setConfig', (_event, llmConfig: { apiKey?: string; baseUrl?: string; model?: string; timeout?: number; verifySSL?: boolean; promptTemplate?: string }) => {
    try {
      const config = loadConfig()
      const nextApiKey = resolveIncomingApiKey(config.llm?.apiKey, llmConfig.apiKey)
      config.llm = {
        ...config.llm,
        ...llmConfig,
        apiKey: nextApiKey
      }
      const saved = saveConfig(config)
      return { success: saved }
    } catch (error) {
      logger.error('Failed to set LLM config:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to set LLM config' }
    }
  })

  ipcMain.handle('llm:generateSummary', async (_event, request: SummaryRequest) => {
    try {
      const config = loadConfig()

      if (!config.llm?.apiKey || !config.llm?.baseUrl) {
        return {
          success: false,
          error: '璇峰厛閰嶇疆 LLM API Key 鍜?Base URL'
        }
      }

      const summary = await generateSummary(
        {
          apiKey: config.llm.apiKey,
          baseUrl: config.llm.baseUrl,
          model: config.llm.model,
          timeout: config.llm.timeout,
          verifySSL: config.llm.verifySSL,
          promptTemplate: config.llm.promptTemplate,
        },
        request
      )

      return { success: true, summary }
    } catch (error) {
      logger.error('Failed to generate summary:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate summary'
      }
    }
  })
}

