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
