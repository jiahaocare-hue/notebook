import { ipcMain } from 'electron'
import type { AgentService } from '../services/agent'
import type { AgentImageAttachment } from '../services/agentTools'
import { logger } from '../services/logger'

type AgentHandlersContext = {
  getAgentService: () => AgentService | null
}

export function registerAgentHandlers(context: AgentHandlersContext): void {
  ipcMain.on('agent:chat', (event, payload: { sessionId?: string; message?: string; requestId?: string; attachments?: unknown }) => {
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

    const attachments = validateAttachments(payload.attachments)

    void agentService.runChat(sessionId, requestId, message, event.sender, attachments).catch(error => {
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

function validateAttachments(value: unknown): AgentImageAttachment[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const attachment = item as Record<string, unknown>
    if (attachment.kind !== 'image' || typeof attachment.path !== 'string' || !attachment.path.trim()) {
      return []
    }

    return [{
      kind: 'image' as const,
      path: attachment.path.trim(),
      name: typeof attachment.name === 'string' && attachment.name.trim() ? attachment.name.trim() : 'image',
    }]
  })
}
