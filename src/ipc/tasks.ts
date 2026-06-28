import type {
  ActivityTimelineItem,
  AgentApi,
  ChatApi,
  ElectronAPI,
  ImageOCRInfo,
  NewTask,
  OCRLogsPage,
  SearchMode,
  SearchOptions,
  SubtaskCounts,
  SummaryRequest,
  SummaryStatsFilters,
  Task,
  TaskAskRequest,
  TaskAskResult,
  TaskFilters,
  TaskHistory,
  TaskStats,
  TaskWithHistory,
  UpdateTask,
} from '../types'

declare global {
  interface Window {
    electronAPI: ElectronAPI
    agentApi?: AgentApi
    chatApi?: ChatApi
  }
}

const getElectronAPI = () => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI
  }
  return null
}

export const taskApi = {
  create: async (task: NewTask): Promise<number> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.createTask(task)
  },
  update: async (id: number, task: UpdateTask): Promise<boolean> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.updateTask(id, task)
  },
  delete: async (id: number): Promise<boolean> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.deleteTask(id)
  },
  get: async (id: number): Promise<Task | undefined> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getTask(id)
  },
  getMany: async (ids: number[]): Promise<Task[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getTasks(ids)
  },
  list: async (filters?: TaskFilters): Promise<Task[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.listTasks(filters)
  },
  listWithHistory: async (filters?: { startDate?: string; endDate?: string; dateFilterMode?: string }): Promise<TaskWithHistory[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.listTasksWithHistory(filters)
  },
  getCounts: async (filters?: { date?: string; startDate?: string; endDate?: string; dateFilterMode?: string }): Promise<{ all: number; pending: number; in_progress: number; completed: number; cancelled: number }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getCounts(filters)
  },
  getSummaryStats: async (filters?: SummaryStatsFilters): Promise<TaskStats> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getSummaryStats(filters)
  },
  getEarliestDate: async (): Promise<string> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getEarliestTaskDate()
  },
  listSubtasks: async (parentId: number): Promise<Task[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.listSubtasks(parentId)
  },
  getSubtaskCounts: async (taskId: number): Promise<SubtaskCounts> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getSubtaskCounts(taskId)
  },
  getSubtaskCountsBatch: async (taskIds: number[]): Promise<Record<number, SubtaskCounts>> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getSubtaskCountsBatch(taskIds)
  },
  getActivityTimeline: async (taskId: number, options?: { limit?: number; offset?: number }): Promise<ActivityTimelineItem[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getActivityTimeline(taskId, options)
  },
  getHistory: async (id: number, options?: { limit?: number; offset?: number }): Promise<TaskHistory[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getTaskHistory(id, options)
  },
  deleteHistory: async (historyId: number): Promise<boolean> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.deleteHistory(historyId)
  },
  updateHistory: async (historyId: number, newValue: string): Promise<boolean> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.updateHistory(historyId, newValue)
  },
}

export const searchApi = {
  keyword: async (query: string, options?: SearchOptions): Promise<Task[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.searchKeyword(query, options)
  },
  semantic: async (query: string, options?: SearchOptions): Promise<{ error?: string; tasks: Task[] }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    const result = await api.searchSemantic(query, options)
    return result
  },
  hybrid: async (query: string, options?: SearchOptions): Promise<{ error?: string; tasks: Task[] }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    const result = await api.searchHybrid(query, options)
    return result
  },
  image: (query: string, options?: SearchOptions): Promise<Task[]> => 
    window.electronAPI.searchImage(query, options),
}

export const searchByMode = async (query: string, mode: SearchMode, options?: SearchOptions): Promise<{ error?: string; tasks: Task[] }> => {
  switch (mode) {
    case 'keyword': {
      const tasks = await searchApi.keyword(query, options)
      return { tasks }
    }
    case 'hybrid':
      return searchApi.hybrid(query, options)
    case 'image': {
      const imageTasks = await searchApi.image(query, options)
      return { tasks: imageTasks }
    }
    default: {
      const tasks = await searchApi.keyword(query, options)
      return { tasks }
    }
  }
}

export const imageApi = {
  save: async (imageData: string, fileName: string, taskId?: number): Promise<string | null> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    const result = await api.saveImage(imageData, fileName, taskId)
    return result.success ? result.path || null : null
  },
  load: async (imagePath: string): Promise<string | null> => {
    if (!imagePath) return null
    return `app-image://local/${encodeURIComponent(imagePath)}`
  },
  delete: async (imagePath: string): Promise<boolean> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    const result = await api.deleteImage(imagePath)
    return result.success
  },
}

export const llmApi = {
  getConfig: async (): Promise<{ apiKey: string | null; baseUrl: string | null; model: string | null; timeout: number; verifySSL: boolean; promptTemplate: string | null }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getLlmConfig()
  },
  setConfig: async (config: { apiKey?: string; baseUrl?: string; model?: string; timeout?: number; verifySSL?: boolean; promptTemplate?: string }): Promise<{ success: boolean; error?: string }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.setLlmConfig(config)
  },
  generateSummary: async (request: SummaryRequest): Promise<{ success: boolean; summary?: string; error?: string }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.generateSummary(request)
  },
}

export const askApi = {
  askTasks: async (request: TaskAskRequest): Promise<TaskAskResult> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    if (typeof api.askTasks !== 'function') {
      throw new Error('问答助手接口尚未加载，请重启应用后再试')
    }
    return api.askTasks(request)
  },
}

export const clipboardApi = {
  writeImage: async (imageData: string): Promise<{ success: boolean; error?: string }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.writeImageToClipboard(imageData)
  },
  readImage: async (): Promise<{ image: string | null; error?: string }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.readImageFromClipboard()
  },
}

export const appApi = {
  getVersion: async (): Promise<string> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getAppVersion()
  },
  checkForUpdates: async (): Promise<{ success: boolean; error?: string }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.checkForUpdates()
  },
  openLogFolder: async (): Promise<{ success: boolean }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.openLogFolder()
  },
}

export const ocrApi = {
  getTaskImageInfo: async (taskId: number): Promise<ImageOCRInfo[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getTaskImageOCRInfo(taskId)
  },
  getLogs: async (options?: number | { limit?: number; offset?: number }): Promise<OCRLogsPage> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    const result = await api.getOCRLogs(options)
    if (Array.isArray(result)) {
      return {
        logs: result,
        total: result.length,
        limit: typeof options === 'number' ? options : result.length,
        offset: 0,
      }
    }
    return result
  },
  retry: async (taskId: number, imagePath: string): Promise<{ success: boolean; error?: string }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.retryOCR(taskId, imagePath)
  },
}
