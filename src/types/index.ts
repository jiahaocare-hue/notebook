export interface Task {
  id: number
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface NewTask {
  title: string
  description?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority?: 'low' | 'medium' | 'high'
  due_date?: string
}

export interface UpdateTask {
  title?: string
  description?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority?: 'low' | 'medium' | 'high'
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

export type SearchMode = 'keyword' | 'hybrid' | 'image'

export type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'cancelled'

export type DateFilter = 'today' | 'week' | 'history'

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
