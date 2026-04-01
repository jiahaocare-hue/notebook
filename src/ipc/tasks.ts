import { Task, NewTask, UpdateTask, TaskHistory, TaskFilters, SearchMode, SearchOptions, SummaryRequest } from '../types'

declare global {
  interface Window {
    electronAPI: {
      createTask: (task: NewTask) => Promise<number>
      updateTask: (taskId: number, task: UpdateTask) => Promise<boolean>
      deleteTask: (taskId: number) => Promise<boolean>
      getTask: (taskId: number) => Promise<Task | undefined>
      listTasks: (filters?: TaskFilters) => Promise<Task[]>
      getCounts: (filters?: { date?: string; startDate?: string; endDate?: string }) => Promise<{ all: number; pending: number; in_progress: number; completed: number; cancelled: number }>
      getTaskHistory: (taskId: number, options?: { limit?: number; offset?: number }) => Promise<TaskHistory[]>
      searchKeyword: (query: string, options?: SearchOptions) => Promise<Task[]>
      searchSemantic: (query: string, options?: SearchOptions) => Promise<{ error?: string; tasks: Task[] }>
      searchHybrid: (query: string, options?: SearchOptions) => Promise<{ error?: string; tasks: Task[] }>
      setApiKey: (apiKey: string) => Promise<boolean>
      getApiKey: () => Promise<string | null>
      saveImage: (imageData: string, fileName: string, taskId?: number) => Promise<{ success: boolean; path?: string; error?: string }>
      searchImage: (query: string, options?: SearchOptions) => Promise<Task[]>
      loadImage: (imagePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
      deleteImage: (imagePath: string) => Promise<{ success: boolean; error?: string }>
      getConfig: () => Promise<{ dataDir: string; customDataDir: string | null }>
      setDataDir: (dataDir: string | null) => Promise<{ success: boolean; error?: string }>
      openDirectoryDialog: () => Promise<{ canceled: boolean; filePath: string | null }>
      focusWindow: () => Promise<boolean>
      showConfirmDialog: (message: string) => Promise<boolean>
      getLlmConfig: () => Promise<{ apiKey: string | null; baseUrl: string | null; model: string | null; timeout: number; verifySSL: boolean; promptTemplate: string | null }>
      setLlmConfig: (config: { apiKey?: string; baseUrl?: string; model?: string; timeout?: number; verifySSL?: boolean; promptTemplate?: string }) => Promise<{ success: boolean; error?: string }>
      generateSummary: (request: SummaryRequest) => Promise<{ success: boolean; summary?: string; error?: string }>
      saveFile: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[]; content: string }) => Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }>
      saveBinaryFile: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[]; content: number[] }) => Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }>
      writeImageToClipboard: (imageData: string) => Promise<{ success: boolean; error?: string }>
      getAppVersion: () => Promise<string>
      checkForUpdates: () => Promise<{ success: boolean; error?: string }>
    }
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
  list: async (filters?: TaskFilters): Promise<Task[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.listTasks(filters)
  },
  getCounts: async (filters?: { date?: string; startDate?: string; endDate?: string }): Promise<{ all: number; pending: number; in_progress: number; completed: number; cancelled: number }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getCounts(filters)
  },
  getHistory: async (id: number, options?: { limit?: number; offset?: number }): Promise<TaskHistory[]> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.getTaskHistory(id, options)
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
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    const result = await api.loadImage(imagePath)
    return result.success ? result.data || null : null
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

export const clipboardApi = {
  writeImage: async (imageData: string): Promise<{ success: boolean; error?: string }> => {
    const api = getElectronAPI()
    if (!api) throw new Error('electronAPI not available')
    return api.writeImageToClipboard(imageData)
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
}
