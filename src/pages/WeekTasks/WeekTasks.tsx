import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Task, NewTask, UpdateTask, StatusFilter } from '../../types'
import { taskApi } from '../../ipc/tasks'
import TaskCard from '../../components/TaskCard'
import TaskForm from '../../components/TaskForm'
import TaskDetail from '../../components/TaskDetail'
import Modal from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'

interface WeekTasksProps {
  statusFilter: StatusFilter
  onTaskCountsChange?: (counts: { all: number; pending: number; in_progress: number; completed: number; cancelled: number }) => void
}

const getWeekRange = (date: Date = new Date()) => {
  const current = new Date(date)
  const dayOfWeek = current.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  
  const monday = new Date(current)
  monday.setDate(current.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)
  
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  
  return { monday, sunday }
}

const formatDateStr = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const WeekTasks: React.FC<WeekTasksProps> = ({ statusFilter, onTaskCountsChange }) => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null)

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { monday, sunday } = getWeekRange()
      const filters: { startDate: string; endDate: string; status?: string } = {
        startDate: formatDateStr(monday),
        endDate: formatDateStr(sunday),
      }
      
      if (statusFilter !== 'all') {
        filters.status = statusFilter
      }
      
      const taskList = await taskApi.list(filters)
      setTasks(taskList)
      
      if (onTaskCountsChange) {
        const allTasks = await taskApi.list({
          startDate: formatDateStr(monday),
          endDate: formatDateStr(sunday),
        })
        const counts = {
          all: allTasks.length,
          pending: allTasks.filter(t => t.status === 'pending').length,
          in_progress: allTasks.filter(t => t.status === 'in_progress').length,
          completed: allTasks.filter(t => t.status === 'completed').length,
          cancelled: allTasks.filter(t => t.status === 'cancelled').length,
        }
        onTaskCountsChange(counts)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务失败')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, onTaskCountsChange])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

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
      await taskApi.delete(taskToDelete)
      setShowDetailModal(false)
      setSelectedTask(null)
      loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务失败')
    } finally {
      setShowDeleteConfirm(false)
      setTaskToDelete(null)
    }
  }

  const handleTaskUpdate = async (updatedTask: Task) => {
    try {
      await taskApi.update(updatedTask.id, {
        title: updatedTask.title,
        description: updatedTask.description ?? undefined,
        status: updatedTask.status,
        priority: updatedTask.priority,
        due_date: updatedTask.due_date ?? undefined,
      })
      loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新任务失败')
    }
  }

  const selectedTaskRef = useRef(selectedTask)
  
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
    }
  }, [tasks])

  const handleFormSubmit = async (data: NewTask | UpdateTask) => {
    try {
      if (editingTask) {
        await taskApi.update(editingTask.id, data as UpdateTask)
      } else {
        const newTaskData = data as NewTask
        if (!newTaskData.due_date) {
          newTaskData.due_date = formatDateStr(new Date())
        }
        await taskApi.create(newTaskData)
      }
      setShowFormModal(false)
      setEditingTask(null)
      loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存任务失败')
    }
  }

  const handleStatusChange = async (task: Task, newStatus: Task['status']) => {
    try {
      await taskApi.update(task.id, { status: newStatus })
      loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新状态失败')
    }
  }

  const groupTasksByDate = (tasks: Task[]) => {
    const grouped: { [key: string]: Task[] } = {}
    tasks.forEach(task => {
      const date = task.due_date || '无日期'
      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push(task)
    })
    return grouped
  }

  const formatDisplayDate = (dateStr: string) => {
    if (dateStr === '无日期') return '无日期'
    const date = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const taskDate = new Date(date)
    taskDate.setHours(0, 0, 0, 0)
    
    const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const weekday = weekdays[date.getDay()]
    
    if (diffDays === 0) return `今天 (${weekday})`
    if (diffDays === 1) return `明天 (${weekday})`
    if (diffDays === -1) return `昨天 (${weekday})`
    
    return `${date.getMonth() + 1}月${date.getDate()}日 (${weekday})`
  }

  const getWeekDisplayText = () => {
    const { monday, sunday } = getWeekRange()
    const formatMonthDay = (date: Date) => `${date.getMonth() + 1}月${date.getDate()}日`
    return `${formatMonthDay(monday)} - ${formatMonthDay(sunday)}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  const groupedTasks = groupTasksByDate(tasks)
  const sortedDates = Object.keys(groupedTasks).sort((a, b) => {
    if (a === '无日期') return 1
    if (b === '无日期') return -1
    return new Date(a).getTime() - new Date(b).getTime()
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">本周任务</h1>
          <p className="text-sm text-gray-500 mt-1">
            {getWeekDisplayText()}
          </p>
        </div>
        <button
          onClick={handleCreateTask}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建任务
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-500 mb-4">本周还没有任务</p>
          <button
            onClick={handleCreateTask}
            className="text-blue-500 hover:text-blue-600 font-medium"
          >
            创建第一个任务
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(date => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                {formatDisplayDate(date)}
                <span className="text-xs text-gray-400">({groupedTasks[date].length}个任务)</span>
              </h2>
              <div className="space-y-3">
                {groupedTasks[date].map((task) => (
                  <div key={task.id} className="relative">
                    <TaskCard task={task} onClick={handleTaskClick} />
                    <div className="absolute top-4 right-4 flex gap-1">
                      {task.status !== 'completed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStatusChange(task, 'completed')
                          }}
                          className="p-1 text-green-500 hover:bg-green-50 rounded transition-colors"
                          title="标记为完成"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      )}
                      {task.status === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStatusChange(task, 'in_progress')
                          }}
                          className="p-1 text-yellow-500 hover:bg-yellow-50 rounded transition-colors"
                          title="开始处理"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

export default WeekTasks
