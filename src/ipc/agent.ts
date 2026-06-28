import type { AgentApi, AgentChatPayload, ChatApi } from '../types'

function getAgentApi(): AgentApi {
  if (!window.agentApi) {
    throw new Error('agentApi not available')
  }
  return window.agentApi
}

function getChatApi(): ChatApi {
  if (!window.chatApi) {
    throw new Error('chatApi not available')
  }
  return window.chatApi
}

export const agentApi = {
  chat(payload: AgentChatPayload): void {
    getAgentApi().chat(payload)
  },
  stop(requestId: string): void {
    getAgentApi().stop(requestId)
  },
  confirmHITL(requestId: string, confirmed: boolean): void {
    getAgentApi().confirmHITL(requestId, confirmed)
  },
  onToken(callback: Parameters<AgentApi['onToken']>[0]): () => void {
    return getAgentApi().onToken(callback)
  },
  onTool(callback: Parameters<AgentApi['onTool']>[0]): () => void {
    return getAgentApi().onTool(callback)
  },
  onResult(callback: Parameters<AgentApi['onResult']>[0]): () => void {
    return getAgentApi().onResult(callback)
  },
  onEnd(callback: Parameters<AgentApi['onEnd']>[0]): () => void {
    return getAgentApi().onEnd(callback)
  },
  onError(callback: Parameters<AgentApi['onError']>[0]): () => void {
    return getAgentApi().onError(callback)
  },
  onHITLRequired(callback: Parameters<AgentApi['onHITLRequired']>[0]): () => void {
    return getAgentApi().onHITLRequired(callback)
  },
}

export const chatApi = {
  listSessions: () => getChatApi().listSessions(),
  loadSession: (sessionId: string) => getChatApi().loadSession(sessionId),
  createSession: (title?: string) => getChatApi().createSession(title),
  deleteSession: (sessionId: string) => getChatApi().deleteSession(sessionId),
  renameSession: (sessionId: string, title: string) => getChatApi().renameSession(sessionId, title),
}
