import { contextBridge, ipcRenderer } from 'electron'

export interface Task {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface NewTask {
  title: string
  description?: string
  status?: string
  priority?: string
  due_date?: string
}

export interface UpdateTask {
  title?: string
  description?: string
  status?: string
  priority?: string
  due_date?: string
}

export interface TaskHistory {
  id: number
  task_id: number
  action: string
  old_value: string | null
  new_value: string | null
  timestamp: string
}

export interface TaskFilters {
  date?: string
  status?: string
  startDate?: string
  endDate?: string
}

export interface SearchOptions {
  fields?: string[]
  limit?: number
  startDate?: string
  endDate?: string
}

export interface SemanticSearchResult extends Task {
  similarity: number
}

export interface HybridSearchResult extends Task {
  similarity: number
  keywordMatch: number
  combinedScore: number
}

export interface SearchResult<T> {
  error?: string
  tasks: T[]
}

export interface TaskStats {
  total: number
  completed: number
  inProgress: number
  pending: number
  cancelled: number
  completionRate: number
  avgCompletionTime?: number
  priorityDistribution: {
    high: number
    medium: number
    low: number
  }
  monthlyDistribution: { month: string; count: number }[]
}

export interface CompletedTask {
  title: string
  description: string | null
  priority: string
  completedAt?: string
}

export interface SummaryRequest {
  stats: TaskStats
  completedTasks: CompletedTask[]
  timeRange?: {
    startDate: string
    endDate: string
  }
  summaryType?: 'weekly' | 'yearly'
  pendingTasks?: CompletedTask[]
  inProgressTasks?: CompletedTask[]
}

export interface ImageOCRInfo {
  id: number
  task_id: number
  image_path: string
  text_content: string | null
  ocr_status: string
  ocr_error: string | null
  ocr_timestamp: string | null
  created_at: string
}

export interface OCRLog {
  id: number
  task_id: number | null
  image_path: string | null
  status: string
  message: string | null
  error: string | null
  timestamp: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  createTask: (task: NewTask): Promise<number> => ipcRenderer.invoke('task:create', task),
  updateTask: (taskId: number, task: UpdateTask): Promise<boolean> => ipcRenderer.invoke('task:update', taskId, task),
  deleteTask: (taskId: number): Promise<boolean> => ipcRenderer.invoke('task:delete', taskId),
  getTask: (taskId: number): Promise<Task | undefined> => ipcRenderer.invoke('task:get', taskId),
  listTasks: (filters?: TaskFilters): Promise<Task[]> => ipcRenderer.invoke('task:list', filters),
  getCounts: (filters?: { date?: string; startDate?: string; endDate?: string }): Promise<{ all: number; pending: number; in_progress: number; completed: number; cancelled: number }> => ipcRenderer.invoke('task:getCounts', filters),

  getTaskHistory: (taskId: number, options?: { limit?: number; offset?: number }): Promise<TaskHistory[]> => ipcRenderer.invoke('history:getByTaskId', taskId, options),

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
  setDataDir: (dataDir: string | null): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('config:setDataDir', dataDir),
  openDirectoryDialog: (): Promise<{ canceled: boolean; filePath: string | null }> => ipcRenderer.invoke('dialog:openDirectory'),
  focusWindow: (): Promise<boolean> => ipcRenderer.invoke('window:focus'),
  showConfirmDialog: (message: string): Promise<boolean> => ipcRenderer.invoke('dialog:confirm', message),

  getLlmConfig: (): Promise<{ apiKey: string | null; baseUrl: string | null; model: string | null; timeout: number; verifySSL: boolean; promptTemplate: string | null }> => ipcRenderer.invoke('llm:getConfig'),
  setLlmConfig: (config: { apiKey?: string; baseUrl?: string; model?: string; timeout?: number; verifySSL?: boolean; promptTemplate?: string }): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('llm:setConfig', config),
  generateSummary: (request: SummaryRequest): Promise<{ success: boolean; summary?: string; error?: string }> => ipcRenderer.invoke('llm:generateSummary', request),

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
  getOCRLogs: (limit?: number): Promise<OCRLog[]> => ipcRenderer.invoke('ocr:getLogs', limit),
  retryOCR: (taskId: number, imagePath: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('ocr:retry', taskId, imagePath),

  openLogFolder: (): Promise<{ success: boolean }> => ipcRenderer.invoke('log:openFolder'),
})
