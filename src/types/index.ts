export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: number
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  parent_id: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface NewTask {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  due_date?: string
  parent_id?: number
  sort_order?: number
}

export interface UpdateTask {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  due_date?: string
  parent_id?: number | null
  sort_order?: number
}

export interface TaskHistory {
  id: number
  task_id: number
  action: string
  old_value: string | null
  new_value: string | null
  timestamp: string
}

export type TaskHistoryItem = Omit<TaskHistory, 'id' | 'task_id'>

export type TaskWithHistory = Task & { history: TaskHistory[] }

export type SearchMode = 'keyword' | 'hybrid' | 'image'

export type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'cancelled'

export type DateFilter = 'today' | 'week' | 'history'

export type DateFilterMode = 'created' | 'updated' | 'created_or_updated'

export interface TaskFilters {
  date?: string
  status?: string
  startDate?: string
  endDate?: string
  dateFilterMode?: DateFilterMode
}

export interface DateRangeFilters {
  date?: string
  startDate?: string
  endDate?: string
  dateFilterMode?: string
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

export interface TaskCounts {
  all: number
  pending: number
  in_progress: number
  completed: number
  cancelled: number
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

export interface SummaryStatsFilters {
  startDate?: string
  endDate?: string
  dateFilterMode?: string
  bucket?: 'day' | 'month'
}

export interface CompletedTask {
  title: string
  description: string | null
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string | null
  createdAt?: string
  completedAt?: string
  history?: TaskHistoryItem[]
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

export interface ActivityTimelineItem {
  id: number
  task_id: number
  action: string
  old_value: string | null
  new_value: string | null
  timestamp: string
  source_task_id: number
  source_task_title: string
  source_parent_id: number | null
}

export interface SubtaskCounts {
  total: number
  completed: number
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

export interface OCRLogsPage {
  logs: OCRLog[]
  total: number
  limit: number
  offset: number
}

export interface OperationResult {
  success: boolean
  error?: string
}

export interface ImageSaveResult extends OperationResult {
  path?: string
}

export interface ImageLoadResult extends OperationResult {
  data?: string
}

export interface AppConfigResult {
  dataDir: string
  customDataDir: string | null
}

export interface SetDataDirResult extends OperationResult {
  requiresRestart?: boolean
  activeDataDir?: string
  pendingDataDir?: string
}

export interface DirectoryDialogResult {
  canceled: boolean
  filePath: string | null
}

export interface LlmConfig {
  apiKey: string | null
  baseUrl: string | null
  model: string | null
  timeout: number
  verifySSL: boolean
  promptTemplate: string | null
}

export interface LlmConfigUpdate {
  apiKey?: string
  baseUrl?: string
  model?: string
  timeout?: number
  verifySSL?: boolean
  promptTemplate?: string
}

export interface SummaryResult extends OperationResult {
  summary?: string
}

export interface FileSaveOptions {
  defaultPath: string
  filters: { name: string; extensions: string[] }[]
  content: string
}

export interface BinaryFileSaveOptions {
  defaultPath: string
  filters: { name: string; extensions: string[] }[]
  content: number[]
}

export interface FileSaveResult extends OperationResult {
  cancelled?: boolean
  filePath?: string
}

export interface ClipboardReadResult {
  image: string | null
  error?: string
}

export interface OcrProgress {
  status: string
  progress: number
  message: string
}

export interface ElectronAPI {
  createTask: (task: NewTask) => Promise<number>
  updateTask: (taskId: number, task: UpdateTask) => Promise<boolean>
  deleteTask: (taskId: number) => Promise<boolean>
  getTask: (taskId: number) => Promise<Task | undefined>
  getTasks: (taskIds: number[]) => Promise<Task[]>
  listTasks: (filters?: TaskFilters) => Promise<Task[]>
  listTasksWithHistory: (filters?: DateRangeFilters) => Promise<TaskWithHistory[]>
  getCounts: (filters?: DateRangeFilters) => Promise<TaskCounts>
  getSummaryStats: (filters?: SummaryStatsFilters) => Promise<TaskStats>
  getEarliestTaskDate: () => Promise<string>
  listSubtasks: (parentId: number) => Promise<Task[]>
  getSubtaskCounts: (taskId: number) => Promise<SubtaskCounts>
  getSubtaskCountsBatch: (taskIds: number[]) => Promise<Record<number, SubtaskCounts>>
  getActivityTimeline: (taskId: number, options?: { limit?: number; offset?: number }) => Promise<ActivityTimelineItem[]>
  getTaskHistory: (taskId: number, options?: { limit?: number; offset?: number }) => Promise<TaskHistory[]>
  deleteHistory: (historyId: number) => Promise<boolean>
  updateHistory: (historyId: number, newValue: string) => Promise<boolean>
  searchKeyword: (query: string, options?: SearchOptions) => Promise<Task[]>
  searchSemantic: (query: string, options?: SearchOptions) => Promise<SearchResult<SemanticSearchResult>>
  searchHybrid: (query: string, options?: SearchOptions & { keywordWeight?: number }) => Promise<SearchResult<HybridSearchResult>>
  setApiKey: (apiKey: string) => Promise<boolean>
  getApiKey: () => Promise<string | null>
  saveImage: (imageData: string, fileName: string, taskId?: number) => Promise<ImageSaveResult>
  loadImage: (imagePath: string) => Promise<ImageLoadResult>
  deleteImage: (imagePath: string) => Promise<OperationResult>
  searchImage: (query: string, options?: SearchOptions) => Promise<Task[]>
  getConfig: () => Promise<AppConfigResult>
  setDataDir: (dataDir: string | null) => Promise<SetDataDirResult>
  openDirectoryDialog: () => Promise<DirectoryDialogResult>
  focusWindow: () => Promise<boolean>
  showConfirmDialog: (message: string) => Promise<boolean>
  getLlmConfig: () => Promise<LlmConfig>
  setLlmConfig: (config: LlmConfigUpdate) => Promise<OperationResult>
  generateSummary: (request: SummaryRequest) => Promise<SummaryResult>
  saveFile: (options: FileSaveOptions) => Promise<FileSaveResult>
  saveBinaryFile: (options: BinaryFileSaveOptions) => Promise<FileSaveResult>
  writeImageToClipboard: (imageData: string) => Promise<OperationResult>
  readImageFromClipboard: () => Promise<ClipboardReadResult>
  getAppVersion: () => Promise<string>
  checkForUpdates: () => Promise<OperationResult>
  onOcrProgress: (callback: (progress: OcrProgress) => void) => void
  removeOcrProgressListener: () => void
  getTaskImageOCRInfo: (taskId: number) => Promise<ImageOCRInfo[]>
  getOCRLogs: (options?: number | { limit?: number; offset?: number }) => Promise<OCRLog[] | OCRLogsPage>
  retryOCR: (taskId: number, imagePath: string) => Promise<OperationResult>
  openLogFolder: () => Promise<{ success: boolean }>
}
