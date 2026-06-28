import { ipcMain } from 'electron'
import type { ChatStore } from '../services/chatStore'

type ChatHandlersContext = {
  getChatStore: () => ChatStore | null
}

export function registerChatHandlers(context: ChatHandlersContext): void {
  ipcMain.handle('chat:listSessions', () => {
    return context.getChatStore()?.listSessions() ?? []
  })

  ipcMain.handle('chat:loadSession', (_event, sessionId: string) => {
    return context.getChatStore()?.loadMessages(sessionId) ?? []
  })

  ipcMain.handle('chat:createSession', (_event, title?: string) => {
    const store = context.getChatStore()
    if (!store) {
      throw new Error('会话服务尚未初始化')
    }
    return store.createSession(title || '新对话')
  })

  ipcMain.handle('chat:deleteSession', (_event, sessionId: string) => {
    context.getChatStore()?.deleteSession(sessionId)
    return true
  })

  ipcMain.handle('chat:renameSession', (_event, sessionId: string, title: string) => {
    context.getChatStore()?.renameSession(sessionId, title)
    return true
  })
}
