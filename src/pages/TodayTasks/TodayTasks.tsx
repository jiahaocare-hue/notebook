import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Task, NewTask, UpdateTask, StatusFilter, DateFilter } from '../../types'
import { useTaskContext } from '../../context/TaskContext'
import TaskCard from '../../components/TaskCard'
import TaskForm from '../../components/TaskForm'
import TaskDetail from '../../components/TaskDetail'
import Modal from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { TaskListSkeleton } from '../../components/Skeleton'
import { DateRangePicker } from '../../components/DatePicker'

type SortType = 'created_at' | 'due_date' | 'priority'
type SortOrder = 'asc' | 'desc'

interface TodayTasksProps {
  statusFilter: StatusFilter
  dateFilter: DateFilter
}

const TodayTasks: React.FC<TodayTasksProps> = ({ statusFilter, dateFilter }) => {
  const { tasks, loading, refreshTasks, refreshCounts, createTask, updateTask, deleteTask } = useTaskContext()
  const [error, setError] = useState<string | null>(null)
  
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null)
  
  const [historyStartDate, setHistoryStartDate] = useState<string>(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [historyEndDate, setHistoryEndDate] = useState<string>(() => {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  
  const [sortType, setSortType] = useState<SortType>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const getTodayDate = () => formatDateLocal(new Date())

  const getWeekDateRange = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    
    return {
      startDate: formatDateLocal(monday),
      endDate: formatDateLocal(sunday)
    }
  }

  const getFilters = useCallback(() => {
    const filters: Record<string, string> = {}
    
    if (dateFilter === 'today') {
      filters.date = getTodayDate()
    } else if (dateFilter === 'week') {
      const { startDate, endDate } = getWeekDateRange()
      filters.startDate = startDate
      filters.endDate = endDate
    } else if (dateFilter === 'history') {
      filters.startDate = historyStartDate
      filters.endDate = historyEndDate
    }
    
    if (statusFilter !== 'all') {
      filters.status = statusFilter
    }
    
    return filters
  }, [dateFilter, statusFilter, historyStartDate, historyEndDate])

  // 首次加载和筛选条件变化时，刷新任务列表和计数
  useEffect(() => {
    const filters = getFilters()
    refreshTasks(filters)
    
    // 只传递日期筛选条件给 refreshCounts，不包含 status
    const dateFilters: { date?: string; startDate?: string; endDate?: string } = {}
    if (filters.date) dateFilters.date = filters.date
    if (filters.startDate) dateFilters.startDate = filters.startDate
    if (filters.endDate) dateFilters.endDate = filters.endDate
    refreshCounts(dateFilters)
  }, [getFilters, refreshTasks, refreshCounts])

  const filteredTasks = useMemo(() => {
    return tasks
  }, [tasks])

  const sortedTasks = useMemo(() => {
    const priorityWeight = (priority: string): number => {
      switch (priority) {
        case 'high': return 3
        case 'medium': return 2
        case 'low': return 1
        default: return 0
      }
    }
    
    const sorted = [...filteredTasks]
    sorted.sort((a, b) => {
      let comparison = 0
      
      switch (sortType) {
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'due_date':
          const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity
          const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity
          comparison = dateA - dateB
          break
        case 'priority':
          comparison = priorityWeight(a.priority) - priorityWeight(b.priority)
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })
    
    return sorted
  }, [filteredTasks, sortType, sortOrder])

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setShowDetailModal(true)
  }

  const handleCreateTask = () => {
    setEditingTask(null)
    setShowFormModal(true)
  }

  const handleDeleteTask = (id: number) => {
    setTaskToDelete(id)
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    if (!taskToDelete) return
    
    try {
      await deleteTask(taskToDelete)
      setShowDetailModal(false)
      setSelectedTask(null)
      
      const filters = getFilters()
      await refreshTasks(filters)
      
      const dateFilters: { date?: string; startDate?: string; endDate?: string } = {}
      if (filters.date) dateFilters.date = filters.date
      if (filters.startDate) dateFilters.startDate = filters.startDate
      if (filters.endDate) dateFilters.endDate = filters.endDate
      await refreshCounts(dateFilters)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务失败')
    } finally {
      setShowDeleteConfirm(false)
      setTaskToDelete(null)
    }
  }

  const handleTaskUpdate = async (updatedTask: Task) => {
    try {
      await updateTask(updatedTask.id, {
        title: updatedTask.title,
        description: updatedTask.description ?? undefined,
        status: updatedTask.status,
        priority: updatedTask.priority,
        due_date: updatedTask.due_date ?? undefined,
      })
      // 刷新任务列表和计数
      const filters = getFilters()
      await refreshTasks(filters)
      
      // 只传递日期筛选条件给 refreshCounts
      const dateFilters: { date?: string; startDate?: string; endDate?: string } = {}
      if (filters.date) dateFilters.date = filters.date
      if (filters.startDate) dateFilters.startDate = filters.startDate
      if (filters.endDate) dateFilters.endDate = filters.endDate
      await refreshCounts(dateFilters)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新任务失败')
    }
  }

  // 使用 ref 来跟踪是否应该保持 selectedTask，避免刷新时丢失
  const selectedTaskRef = useRef(selectedTask)
  
  // 同步更新 ref
  useEffect(() => {
    selectedTaskRef.current = selectedTask
  }, [selectedTask])
  
  useEffect(() => {
    const currentTask = selectedTaskRef.current
    if (currentTask) {
      const latestTask = tasks.find(t => t.id === currentTask.id)
      if (latestTask) {
        setSelectedTask(latestTask)
        selectedTaskRef.current = latestTask
      }
      // 关键修复：即使 latestTask 临时为空（刷新中间状态），也不清除 selectedTask
      // 这样可以避免 TaskDetail 卸载导致 history 状态重置的问题
    }
  }, [tasks])

  const handleFormSubmit = async (data: NewTask | UpdateTask) => {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, data as UpdateTask)
      } else {
        const newTaskData = data as NewTask
        if (!newTaskData.due_date) {
          newTaskData.due_date = getTodayDate()
        }
        await createTask(newTaskData)
      }
      setShowFormModal(false)
      setEditingTask(null)
      // 刷新任务列表和计数，使用当前的筛选条件
      const filters = getFilters()
      await refreshTasks(filters)
      
      // 只传递日期筛选条件给 refreshCounts
      const dateFilters: { date?: string; startDate?: string; endDate?: string } = {}
      if (filters.date) dateFilters.date = filters.date
      if (filters.startDate) dateFilters.startDate = filters.startDate
      if (filters.endDate) dateFilters.endDate = filters.endDate
      await refreshCounts(dateFilters)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存任务失败')
    }
  }

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  const getPageTitle = () => {
    switch (dateFilter) {
      case 'today': return '今日任务'
      case 'week': return '本周任务'
      case 'history': return '历史任务'
      default: return '任务列表'
    }
  }

  const getPageSubtitle = () => {
    if (dateFilter === 'today') {
      return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    } else if (dateFilter === 'week') {
      const { startDate, endDate } = getWeekDateRange()
      return `${startDate} 至 ${endDate}`
    } else if (dateFilter === 'history') {
      return `${historyStartDate} 至 ${historyEndDate}`
    }
    return ''
  }

  const getEmptyMessage = () => {
    switch (dateFilter) {
      case 'today': return '今天还没有任务'
      case 'week': return '本周还没有任务'
      case 'history': return '该时间段没有任务'
      default: return '暂无任务'
    }
  }

  if (loading) {
    return <TaskListSkeleton count={5} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{getPageTitle()}</h1>
          {getPageSubtitle() && (
            <p className="text-sm text-gray-500 mt-1">{getPageSubtitle()}</p>
          )}
        </div>
        <button
          onClick={handleCreateTask}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建任务
        </button>
      </div>

      {dateFilter === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-600">时间范围</span>
            <DateRangePicker
              startDate={historyStartDate}
              endDate={historyEndDate}
              onStartDateChange={setHistoryStartDate}
              onEndDateChange={setHistoryEndDate}
              startPlaceholder="开始日期"
              endPlaceholder="结束日期"
              className="flex-1"
            />
            <button
              onClick={() => refreshTasks(getFilters())}
              className="px-5 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
            >
              查询
            </button>
          </div>
        </div>
      )}

      {sortedTasks.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">排序：</span>
            <div className="flex items-center gap-2">
              <select
                value={sortType}
                onChange={(e) => setSortType(e.target.value as SortType)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
              >
                <option value="created_at">创建时间</option>
                <option value="due_date">截止时间</option>
                <option value="priority">优先级</option>
              </select>
              <button
                onClick={toggleSortOrder}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                {sortOrder === 'asc' ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                    升序
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                    </svg>
                    降序
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {sortedTasks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-500 mb-4">{getEmptyMessage()}</p>
          <button
            onClick={handleCreateTask}
            className="text-blue-500 hover:text-blue-600 font-medium"
          >
            创建第一个任务
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedTasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={handleTaskClick} />
          ))}
        </div>
      )}

      <Modal
        title={editingTask ? '编辑任务' : '新建任务'}
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false)
          setEditingTask(null)
        }}
      >
        <TaskForm
          task={editingTask || undefined}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setShowFormModal(false)
            setEditingTask(null)
          }}
        />
      </Modal>

      <Modal
        title="任务详情"
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false)
          setSelectedTask(null)
        }}
      >
        {selectedTask && (
          <TaskDetail
            key={selectedTask.id}
            task={selectedTask}
            onDelete={handleDeleteTask}
            onUpdate={handleTaskUpdate}
          />
        )}
      </Modal>

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

export default TodayTasks
