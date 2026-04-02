import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from 'react'
import { Task, NewTask, UpdateTask } from '../types'
import { taskApi } from '../ipc/tasks'

interface TaskCounts {
  all: number
  pending: number
  in_progress: number
  completed: number
  cancelled: number
}

interface TaskContextType {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  loading: boolean
  taskCounts: TaskCounts
  totalTaskCounts: TaskCounts
  refreshTasks: (filters?: Record<string, string>) => Promise<void>
  refreshCounts: (filters?: { date?: string; startDate?: string; endDate?: string }) => Promise<void>
  createTask: (task: NewTask) => Promise<number>
  updateTask: (id: number, task: UpdateTask) => Promise<boolean>
  deleteTask: (id: number) => Promise<boolean>
  updateTaskLocally: (id: number, task: Partial<Task>) => void
}

const TaskContext = createContext<TaskContextType | undefined>(undefined)

interface TaskProviderProps {
  children: ReactNode
}

export const TaskProvider: React.FC<TaskProviderProps> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [taskCounts, setTaskCounts] = useState<TaskCounts>({
    all: 0,
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  })
  const [totalTaskCounts, setTotalTaskCounts] = useState<TaskCounts>({
    all: 0,
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  })

  const refreshCounts = useCallback(async (filters?: { date?: string; startDate?: string; endDate?: string }) => {
    try {
      const counts = await taskApi.getCounts(filters)
      setTaskCounts(counts)
    } catch (error) {
      console.error('Failed to refresh counts:', error)
    }
  }, [])

  const refreshTotalCounts = useCallback(async () => {
    try {
      const totalCounts = await taskApi.getCounts()
      setTotalTaskCounts(totalCounts)
    } catch (error) {
      console.error('Failed to refresh total counts:', error)
    }
  }, [])

  useEffect(() => {
    refreshTotalCounts()
  }, [refreshTotalCounts])

  const refreshTasks = useCallback(async (filters?: Record<string, string>, showLoading: boolean = true) => {
    if (showLoading) {
      setLoading(true)
    }
    try {
      const fetchedTasks = await taskApi.list(filters)
      setTasks(fetchedTasks)
    } catch (error) {
      console.error('Failed to refresh tasks:', error)
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [])

  const createTask = useCallback(async (task: NewTask): Promise<number> => {
    const tempId = Date.now()
    const now = new Date().toISOString()
    const optimisticTask: Task = {
      id: tempId,
      title: task.title,
      description: task.description || null,
      status: task.status || 'in_progress',
      priority: task.priority || 'medium',
      due_date: task.due_date || null,
      created_at: now,
      updated_at: now,
    }
    
    setTasks(prev => [optimisticTask, ...prev])
    
    try {
      const id = await taskApi.create(task)
      
      setTasks(prev => prev.map(t => 
        t.id === tempId 
          ? { ...t, id } 
          : t
      ))
      
      refreshCounts()
      refreshTotalCounts()
      
      return id
    } catch (error) {
      console.error('Failed to create task:', error)
      setTasks(prev => prev.filter(t => t.id !== tempId))
      throw error
    }
  }, [refreshCounts, refreshTotalCounts])

  const updateTask = useCallback(async (id: number, task: UpdateTask): Promise<boolean> => {
    try {
      const success = await taskApi.update(id, task)
      return success
    } catch (error) {
      console.error('Failed to update task:', error)
      throw error
    }
  }, [])

  const updateTaskLocally = useCallback((id: number, task: Partial<Task>) => {
    setTasks(prev => prev.map(t => 
      t.id === id 
        ? { ...t, ...task, updated_at: new Date().toISOString() }
        : t
    ))
  }, [])

  const deleteTask = useCallback(async (id: number): Promise<boolean> => {
    try {
      const success = await taskApi.delete(id)
      if (success) {
        await refreshTasks()
        await refreshCounts()
        await refreshTotalCounts()
      }
      return success
    } catch (error) {
      console.error('Failed to delete task:', error)
      throw error
    }
  }, [refreshTasks, refreshCounts, refreshTotalCounts])

  const value = useMemo<TaskContextType>(
    () => ({
      tasks,
      setTasks,
      loading,
      taskCounts,
      totalTaskCounts,
      refreshTasks,
      refreshCounts,
      createTask,
      updateTask,
      deleteTask,
      updateTaskLocally,
    }),
    [tasks, loading, taskCounts, totalTaskCounts, refreshTasks, refreshCounts, createTask, updateTask, deleteTask, updateTaskLocally]
  )

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>
}

export const useTaskContext = (): TaskContextType => {
  const context = useContext(TaskContext)
  if (context === undefined) {
    throw new Error('useTaskContext must be used within a TaskProvider')
  }
  return context
}

export { TaskContext }
