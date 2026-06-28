import React, { useState, useCallback, useRef } from 'react'
import { Task, SearchMode, NewTask, UpdateTask } from '../../types'
import { searchByMode, taskApi } from '../../ipc/tasks'
import { useTaskContext } from '../../context/TaskContext'
import TaskCard from '../../components/TaskCard'
import TaskDetail from '../../components/TaskDetail'
import TaskForm from '../../components/TaskForm'
import Modal from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { TaskListSkeleton } from '../../components/Skeleton'
import { DateRangePicker } from '../../components/DatePicker'

const Search: React.FC = () => {
  const { updateTask } = useTaskContext()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('keyword')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [results, setResults] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null)
  const [parentTaskCache, setParentTaskCache] = useState<Record<number, Task>>({})
  const searchRequestSeq = useRef(0)

  const loadParentTasks = useCallback(async (tasks: Task[]) => {
    const parentIds = tasks.filter(t => t.parent_id !== null).map(t => t.parent_id!).filter((v, i, a) => a.indexOf(v) === i)
    if (parentIds.length === 0) {
      return
    }

    try {
      const parents = await taskApi.getMany(parentIds.filter(id => !parentTaskCache[id]))
      if (parents.length > 0) {
        setParentTaskCache(prev => {
          const next = { ...prev }
          for (const parent of parents) {
            next[parent.id] = parent
          }
          return next
        })
      }
      return
    } catch {
      // Fall back to per-parent loading if the batch IPC is unavailable.
    }

    const newParents: Record<number, Task> = { ...parentTaskCache }
    for (const parentId of parentIds) {
      if (!newParents[parentId]) {
        try {
          const parent = await taskApi.get(parentId)
          if (parent) {
            newParents[parentId] = parent
          }
        } catch {
          // 忽略
        }
      }
    }
    setParentTaskCache(newParents)
  }, [parentTaskCache])

  const handleSearch = useCallback(async () => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return

    const requestId = searchRequestSeq.current + 1
    searchRequestSeq.current = requestId
    setLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      const options: { startDate?: string; endDate?: string } = {}

      if (startDate) {
        options.startDate = startDate
      }
      if (endDate) {
        options.endDate = endDate
      }

      const result = await searchByMode(trimmedQuery, mode, options)
      if (requestId !== searchRequestSeq.current) return

      if (result.error) {
        setError(result.error)
        setResults([])
      } else {
        const tasks = result.tasks || []
        setResults(tasks)
        loadParentTasks(tasks)
      }
    } catch (err) {
      if (requestId !== searchRequestSeq.current) return
      console.error('Search failed:', err)
      setError('搜索失败，请重试')
      setResults([])
    } finally {
      if (requestId === searchRequestSeq.current) {
        setLoading(false)
      }
    }
  }, [query, mode, startDate, endDate, loadParentTasks])

  const handleTaskClick = useCallback(async (task: Task) => {
    if (task.parent_id !== null) {
      // 子任务：打开父任务详情
      try {
        const parentTask = await taskApi.get(task.parent_id)
        if (parentTask) {
          setSelectedTask(parentTask)
          setShowDetailModal(true)
        }
      } catch {
        // 如果获取父任务失败，直接打开子任务
        setSelectedTask(task)
        setShowDetailModal(true)
      }
    } else {
      setSelectedTask(task)
      setShowDetailModal(true)
    }
  }, [])

  const handleTaskUpdate = useCallback(async (updatedTask: Task) => {
    try {
      await updateTask(updatedTask.id, {
        title: updatedTask.title,
        description: updatedTask.description ?? undefined,
        status: updatedTask.status,
        priority: updatedTask.priority,
        due_date: updatedTask.due_date ?? undefined,
      })
      const latestTask = await taskApi.get(updatedTask.id)
      if (latestTask) {
        setResults(prev => prev.map(t => t.id === latestTask.id ? latestTask : t))
        setSelectedTask(latestTask)
      }
    } catch (err) {
      console.error('Failed to update task:', err)
      setError(err instanceof Error ? err.message : '更新任务失败')
    }
  }, [updateTask])

  const handleFormSubmit = useCallback(async (data: NewTask | UpdateTask) => {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, data as UpdateTask)
        const updatedTask = { ...editingTask, ...data } as Task
        handleTaskUpdate(updatedTask)
      }
      setShowFormModal(false)
      setEditingTask(null)
    } catch (err) {
      console.error('Failed to save task:', err)
      setError(err instanceof Error ? err.message : '保存任务失败')
    }
  }, [editingTask, handleTaskUpdate, updateTask])

  const handleTaskDelete = (id: number) => {
    setTaskToDelete(id)
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    if (!taskToDelete) return
    
    try {
      await taskApi.delete(taskToDelete)
      setResults(prev => prev.filter(t => t.id !== taskToDelete))
      setShowDetailModal(false)
      setSelectedTask(null)
    } catch (err) {
      console.error('Failed to delete task:', err)
      setError(err instanceof Error ? err.message : '删除任务失败')
    } finally {
      setShowDeleteConfirm(false)
      setTaskToDelete(null)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">搜索任务</h2>

      <div className="mb-6 space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch()
                }
              }}
              placeholder="输入搜索内容..."
              className="w-full px-4 py-3 pl-10 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 disabled:hover:scale-100"
          >
            {loading ? '搜索中...' : '搜索'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">搜索模式:</span>
            <div className="flex gap-1">
              {[
                { value: 'keyword', label: '关键词' },
                { value: 'hybrid', label: '混合搜索' },
                { value: 'image', label: '图片搜索' },
              ].map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value as SearchMode)}
                  className={`px-4 py-2 text-sm rounded-xl transition-all duration-200 ${
                    mode === m.value
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">自定义时间:</span>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl dark:bg-yellow-900/20 dark:border-yellow-800">
          <p className="text-yellow-800 dark:text-yellow-400">{error}</p>
        </div>
      )}

      {hasSearched && !loading && !error && (
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          找到 <span className="font-semibold text-gray-900 dark:text-gray-100">{results.length}</span> 个结果
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <TaskListSkeleton count={5} />
        ) : results.length > 0 ? (
          results.map((task) => (
            <div key={task.id}>
              {task.parent_id !== null && parentTaskCache[task.parent_id] && (
                <div className="flex items-center gap-1 mb-1 ml-1">
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {parentTaskCache[task.parent_id].title}
                  </span>
                </div>
              )}
              <TaskCard
                task={task}
                onClick={() => handleTaskClick(task)}
              />
            </div>
          ))
        ) : hasSearched && !error ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">没有找到匹配的任务</div>
        ) : null}
      </div>

      {showDetailModal && selectedTask && (
        <Modal
          title="任务详情"
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false)
            setSelectedTask(null)
          }}
        >
          <TaskDetail
            key={selectedTask.id}
            task={selectedTask}
            onDelete={handleTaskDelete}
            onUpdate={handleTaskUpdate}
          />
        </Modal>
      )}

      {showFormModal && editingTask && (
        <Modal
          title="编辑任务"
          isOpen={showFormModal}
          onClose={() => {
            setShowFormModal(false)
            setEditingTask(null)
          }}
        >
          <TaskForm
            task={editingTask}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setShowFormModal(false)
              setEditingTask(null)
            }}
          />
        </Modal>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除任务"
        message="确定要删除这个任务吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setTaskToDelete(null)
        }}
        variant="danger"
      />
    </div>
  )
}

export default Search
