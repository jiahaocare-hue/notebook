import { ipcMain } from 'electron'
import { collectTaskAskEvidences, generateTaskAskAnswer } from '../services/ask'
import { loadConfig } from '../services/config'
import { logger } from '../services/logger'
import type { TaskAskRequest, TaskAskResult } from '../../src/types'
import type { DatabaseGetter } from './context'

type AskHandlersContext = {
  getDb: DatabaseGetter
}

export function registerAskHandlers(context: AskHandlersContext): void {
  ipcMain.handle('ask:tasks', async (_event, request: TaskAskRequest): Promise<TaskAskResult> => {
    try {
      const question = request.question?.trim()
      if (!question) {
        return {
          success: false,
          evidences: [],
          error: '请输入要询问的问题',
        }
      }

      const db = context.getDb()
      if (!db) {
        return {
          success: false,
          evidences: [],
          error: '数据库尚未初始化',
        }
      }

      const safeRequest: TaskAskRequest = {
        ...request,
        question,
      }
      const evidences = collectTaskAskEvidences(db, safeRequest)

      if (evidences.length === 0) {
        return {
          success: true,
          evidences,
          answer: '没有在当前范围内找到足够相关的任务记录。可以放宽时间范围、开启更多来源，或者换一个更具体的关键词再试。',
        }
      }

      const config = loadConfig()
      if (!config.llm?.apiKey || !config.llm?.baseUrl) {
        return {
          success: false,
          evidences,
          error: '请先在设置中配置 LLM API Key 和 Base URL。已先为你列出可用证据。',
        }
      }

      const answer = await generateTaskAskAnswer(
        {
          apiKey: config.llm.apiKey,
          baseUrl: config.llm.baseUrl,
          model: config.llm.model,
          timeout: config.llm.timeout,
          verifySSL: config.llm.verifySSL,
        },
        safeRequest,
        evidences
      )

      return {
        success: true,
        answer,
        evidences,
      }
    } catch (error) {
      logger.error('Failed to answer task question:', error)
      return {
        success: false,
        evidences: [],
        error: error instanceof Error ? error.message : '问答生成失败',
      }
    }
  })
}

