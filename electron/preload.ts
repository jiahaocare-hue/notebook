import { contextBridge, ipcRenderer } from 'electron'
import type {
  ElectronAPI,
  HybridSearchResult,
  ImageOCRInfo,
  NewTask,
  OCRLog,
  OCRLogsPage,
  SearchOptions,
  SearchResult,
  SemanticSearchResult,
  SummaryRequest,
  SummaryStatsFilters,
  Task,
  TaskAskRequest,
  TaskAskResult,
  TaskFilters,
  TaskHistory,
  TaskStats,
  UpdateTask,
} from '../src/types'

const electronAPI: ElectronAPI = {
  createTask: (task: NewTask): Promise<number> => ipcRenderer.invoke('task:create', task),
  updateTask: (taskId: number, task: UpdateTask): Promise<boolean> => ipcRenderer.invoke('task:update', taskId, task),
  deleteTask: (taskId: number): Promise<boolean> => ipcRenderer.invoke('task:delete', taskId),
  getTask: (taskId: number): Promise<Task | undefined> => ipcRenderer.invoke('task:get', taskId),
  getTasks: (taskIds: number[]): Promise<Task[]> => ipcRenderer.invoke('task:getMany', taskIds),
  listTasks: (filters?: TaskFilters): Promise<Task[]> => ipcRenderer.invoke('task:list', filters),
  listTasksWithHistory: (filters?: { startDate?: string; endDate?: string; dateFilterMode?: string }): Promise<(Task & { history: TaskHistory[] })[]> => ipcRenderer.invoke('task:listWithHistory', filters),
  getCounts: (filters?: { date?: string; startDate?: string; endDate?: string; dateFilterMode?: string }): Promise<{ all: number; pending: number; in_progress: number; completed: number; cancelled: number }> => ipcRenderer.invoke('task:getCounts', filters),
  getSummaryStats: (filters?: SummaryStatsFilters): Promise<TaskStats> => ipcRenderer.invoke('task:getSummaryStats', filters),
  getEarliestTaskDate: (): Promise<string> => ipcRenderer.invoke('task:earliest-date'),
  listSubtasks: (parentId: number): Promise<Task[]> => ipcRenderer.invoke('task:listSubtasks', parentId),
  getSubtaskCounts: (taskId: number): Promise<{ total: number; completed: number }> => ipcRenderer.invoke('task:getSubtaskCounts', taskId),
  getSubtaskCountsBatch: (taskIds: number[]): Promise<Record<number, { total: number; completed: number }>> => ipcRenderer.invoke('task:getSubtaskCountsBatch', taskIds),
  getActivityTimeline: (taskId: number, options?: { limit?: number; offset?: number }): Promise<{ id: number; task_id: number; action: string; old_value: string | null; new_value: string | null; timestamp: string; source_task_id: number; source_task_title: string; source_parent_id: number | null }[]> => ipcRenderer.invoke('task:getActivityTimeline', taskId, options),

  getTaskHistory: (taskId: number, options?: { limit?: number; offset?: number }): Promise<TaskHistory[]> => ipcRenderer.invoke('history:getByTaskId', taskId, options),
  deleteHistory: (historyId: number): Promise<boolean> => ipcRenderer.invoke('history:delete', historyId),
  updateHistory: (historyId: number, newValue: string): Promise<boolean> => ipcRenderer.invoke('history:update', historyId, newValue),

  searchKeyword: (query: string, options?: SearchOptions): Promise<Task[]> => ipcRenderer.invoke('search:keyword', query, options),
  searchSemantic: (query: string, options?: SearchOptions): Promise<SearchResult<SemanticSearchResult>> => ipcRenderer.invoke('search:semantic', query, options),
  searchHybrid: (query: string, options?: SearchOptions & { keywordWeight?: number }): Promise<SearchResult<HybridSearchResult>> => ipcRenderer.invoke('search:hybrid', query, options),

  setApiKey: (apiKey: string): Promise<boolean> => ipcRenderer.invoke('config:setApiKey', apiKey),
  getApiKey: (): Promise<string | null> => ipcRenderer.invoke('config:getApiKey'),

  saveImage: (imageData: string, fileName: string, taskId?: number): Promise<{ success: boolean; path?: string; error?: string }> => ipcRenderer.invoke('image:save', imageData, fileName, taskId),
  loadImage: (imagePath: string): Promise<{ success: boolean; data?: string; error?: string }> => ipcRenderer.invoke('image:load', imagePath),
  deleteImage: (imagePath: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('image:delete', imagePath),
  searchImage: (query: string, options?: { limit?: number; startDate?: string; endDate?: string }): Promise<Task[]> => ipcRenderer.invoke('search:image', query, options),

  getConfig: (): Promise<{ dataDir: string; customDataDir: string | null }> => ipcRenderer.invoke('config:get'),
  setDataDir: (dataDir: string | null): Promise<{ success: boolean; error?: string; requiresRestart?: boolean; activeDataDir?: string; pendingDataDir?: string }> => ipcRenderer.invoke('config:setDataDir', dataDir),
  openDirectoryDialog: (): Promise<{ canceled: boolean; filePath: string | null }> => ipcRenderer.invoke('dialog:openDirectory'),
  focusWindow: (): Promise<boolean> => ipcRenderer.invoke('window:focus'),
  showConfirmDialog: (message: string): Promise<boolean> => ipcRenderer.invoke('dialog:confirm', message),

  getLlmConfig: (): Promise<{ apiKey: string | null; baseUrl: string | null; model: string | null; timeout: number; verifySSL: boolean; promptTemplate: string | null }> => ipcRenderer.invoke('llm:getConfig'),
  setLlmConfig: (config: { apiKey?: string; baseUrl?: string; model?: string; timeout?: number; verifySSL?: boolean; promptTemplate?: string }): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('llm:setConfig', config),
  generateSummary: (request: SummaryRequest): Promise<{ success: boolean; summary?: string; error?: string }> => ipcRenderer.invoke('llm:generateSummary', request),
  askTasks: (request: TaskAskRequest): Promise<TaskAskResult> => ipcRenderer.invoke('ask:tasks', request),

  saveFile: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[]; content: string }): Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }> => ipcRenderer.invoke('file:save', options),
  saveBinaryFile: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[]; content: number[] }): Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }> => ipcRenderer.invoke('file:saveBinary', options),

  writeImageToClipboard: (imageData: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('clipboard:writeImage', imageData),
  readImageFromClipboard: (): Promise<{ image: string | null; error?: string }> => ipcRenderer.invoke('clipboard:readImage'),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('app:checkForUpdates'),

  onOcrProgress: (callback: (progress: { status: string; progress: number; message: string }) => void) => {
    ipcRenderer.on('ocr:download-progress', (_event, progress) => callback(progress))
  },
  removeOcrProgressListener: () => {
    ipcRenderer.removeAllListeners('ocr:download-progress')
  },

  getTaskImageOCRInfo: (taskId: number): Promise<ImageOCRInfo[]> => ipcRenderer.invoke('ocr:getTaskImageInfo', taskId),
  getOCRLogs: (options?: number | { limit?: number; offset?: number }): Promise<OCRLog[] | OCRLogsPage> => ipcRenderer.invoke('ocr:getLogs', options),
  retryOCR: (taskId: number, imagePath: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('ocr:retry', taskId, imagePath),

  openLogFolder: (): Promise<{ success: boolean }> => ipcRenderer.invoke('log:openFolder'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

contextBridge.exposeInMainWorld('agentApi', {
  chat: (payload: { sessionId: string; message: string; requestId: string; attachments?: { kind: 'image'; name: string; path: string }[] }) => {
    ipcRenderer.send('agent:chat', payload)
  },
  stop: (requestId: string) => {
    ipcRenderer.send('agent:stop', { requestId })
  },
  confirmHITL: (requestId: string, confirmed: boolean) => {
    ipcRenderer.send('agent:hitl-confirm', { requestId, confirmed })
  },
  onToken: (callback: (data: { requestId: string; delta: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { requestId: string; delta: string }) => callback(data)
    ipcRenderer.on('agent:stream:token', listener)
    return () => ipcRenderer.removeListener('agent:stream:token', listener)
  },
  onTool: (callback: (data: { requestId: string; toolName: string; args: unknown }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { requestId: string; toolName: string; args: unknown }) => callback(data)
    ipcRenderer.on('agent:stream:tool', listener)
    return () => ipcRenderer.removeListener('agent:stream:tool', listener)
  },
  onResult: (callback: (data: { requestId: string; toolName: string; result: unknown }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { requestId: string; toolName: string; result: unknown }) => callback(data)
    ipcRenderer.on('agent:stream:result', listener)
    return () => ipcRenderer.removeListener('agent:stream:result', listener)
  },
  onEnd: (callback: (data: { requestId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { requestId: string }) => callback(data)
    ipcRenderer.on('agent:stream:end', listener)
    return () => ipcRenderer.removeListener('agent:stream:end', listener)
  },
  onError: (callback: (data: { requestId: string; error: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { requestId: string; error: string }) => callback(data)
    ipcRenderer.on('agent:stream:error', listener)
    return () => ipcRenderer.removeListener('agent:stream:error', listener)
  },
  onHITLRequired: (callback: (data: { requestId: string; toolName: string; args: unknown; toolCallId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { requestId: string; toolName: string; args: unknown; toolCallId: string }) => callback(data)
    ipcRenderer.on('agent:stream:hitl-required', listener)
    return () => ipcRenderer.removeListener('agent:stream:hitl-required', listener)
  },
})

contextBridge.exposeInMainWorld('chatApi', {
  listSessions: () => ipcRenderer.invoke('chat:listSessions'),
  loadSession: (sessionId: string) => ipcRenderer.invoke('chat:loadSession', sessionId),
  createSession: (title?: string) => ipcRenderer.invoke('chat:createSession', title),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('chat:deleteSession', sessionId),
  renameSession: (sessionId: string, title: string) => ipcRenderer.invoke('chat:renameSession', sessionId, title),
})
