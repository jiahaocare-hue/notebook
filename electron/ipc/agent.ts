import { ipcMain } from 'electron'
import type { AgentService } from '../services/agent'
import { logger } from '../services/logger'

type AgentHandlersContext = {
  getAgentService: () => AgentService | null
}

export function registerAgentHandlers(context: AgentHandlersContext): void {
  ipcMain.on('agent:chat', (event, payload: { sessionId?: string; message?: string; requestId?: string }) => {
    const agentService = context.getAgentService()
    if (!agentService) {
      event.sender.send('agent:stream:error', { requestId: payload?.requestId, error: 'Agent 服务尚未初始化' })
      return
    }

    const sessionId = payload?.sessionId
    const message = payload?.message?.trim()
    const requestId = payload?.requestId
    if (!sessionId || !message || !requestId) {
      event.sender.send('agent:stream:error', { requestId, error: '对话参数不完整' })
      return
    }

    void agentService.runChat(sessionId, requestId, message, event.sender).catch(error => {
      logger.error('[agent:chat] failed:', error)
      event.sender.send('agent:stream:error', {
        requestId,
        error: error instanceof Error ? error.message : 'Agent 执行失败',
      })
    })
  })

  ipcMain.on('agent:stop', (_event, payload: { requestId?: string }) => {
    if (payload?.requestId) {
      context.getAgentService()?.abort(payload.requestId)
    }
  })

  ipcMain.on('agent:hitl-confirm', (_event, payload: { requestId?: string; confirmed?: boolean }) => {
    if (payload?.requestId) {
      context.getAgentService()?.confirmHITL(payload.requestId, Boolean(payload.confirmed))
    }
  })
}
