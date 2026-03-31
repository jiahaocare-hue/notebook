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
})
