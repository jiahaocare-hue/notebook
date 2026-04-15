import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Task, NewTask, UpdateTask } from '../../types'
import { useTaskContext } from '../../context/TaskContext'
import TaskCard from '../../components/TaskCard'
import TaskForm from '../../components/TaskForm'
import TaskDetail from '../../components/TaskDetail'
import Modal from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'

const statusColors: Record<string, string> = {
  pending: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-gray-400',
}

const CalendarPage: React.FC = () => {
  const { tasks, refreshTasks, createTask, updateTask, deleteTask } = useTaskContext()
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [loading, setLoading] = useState(true)
  
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null)

  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const getMonthDateRange = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    return {
      startDate: formatDateLocal(firstDay),
      endDate: formatDateLocal(lastDay),
    }
  }

  const loadMonthTasks = useCallback(async (year: number, month: number) => {
    setLoading(true)
    try {
      const { startDate, endDate } = getMonthDateRange(year, month)
      await refreshTasks({ startDate, endDate })
    } catch (err) {
      console.error('Failed to load tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [refreshTasks])

  useEffect(() => {
    loadMonthTasks(currentYear, currentMonth)
  }, [currentYear, currentMonth, loadMonthTasks])

  const { daysInMonth, startingDay } = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1)
    const lastDay = new Date(currentYear, currentMonth + 1, 0)
    return {
      daysInMonth: lastDay.getDate(),
      startingDay: firstDay.getDay(),
    }
  }, [currentYear, currentMonth])

  const taskDateMap = useMemo(() => {
    const map = new Map<string, Task[]>()
    tasks.forEach(task => {
      if (task.due_date) {
        const dateKey = task.due_date.split('T')[0]
        const existing = map.get(dateKey) || []
        existing.push(task)
        map.set(dateKey, existing)
      }
    })
    return map
  }, [tasks])

  const getTasksForDay = useCallback((day: number): Task[] => {
    const date = new Date(currentYear, currentMonth, day)
    const dateStr = formatDateLocal(date)
    return taskDateMap.get(dateStr) || []
  }, [currentYear, currentMonth, taskDateMap])

  const isToday = useCallback((day: number) => {
    const today = new Date()
    return day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
  }, [currentMonth, currentYear])

  const isSelected = useCallback((day: number) => {
    if (!selectedDate) return false
    return day === selectedDate.getDate() &&
      currentMonth === selectedDate.getMonth() &&
      currentYear === selectedDate.getFullYear()
  }, [selectedDate, currentMonth, currentYear])

  const prevMonth = useCallback(() => {
    const newMonth = currentMonth === 0 ? 11 : currentMonth - 1
    const newYear = currentMonth === 0 ? currentYear - 1 : currentYear
    setCurrentYear(newYear)
    setCurrentMonth(newMonth)
  }, [currentYear, currentMonth])

  const nextMonth = useCallback(() => {
    const newMonth = currentMonth === 11 ? 0 : currentMonth + 1
    const newYear = currentMonth === 11 ? currentYear + 1 : currentYear
    setCurrentYear(newYear)
    setCurrentMonth(newMonth)
  }, [currentYear, currentMonth])

  const handleDateSelect = (day: number) => {
    setSelectedDate(new Date(currentYear, currentMonth, day))
  }

  const selectedDateTasks = useMemo(() => {
    if (!selectedDate) return []
    const dateStr = formatDateLocal(selectedDate)
    return taskDateMap.get(dateStr) || []
  }, [selectedDate, taskDateMap])

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
      loadMonthTasks(currentYear, currentMonth)
    } catch (err) {
      console.error('Failed to delete task:', err)
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
      loadMonthTasks(currentYear, currentMonth)
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }

  const handleFormSubmit = async (data: NewTask | UpdateTask) => {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, data as UpdateTask)
      } else {
        const newTaskData = data as NewTask
        if (!newTaskData.due_date && selectedDate) {
          newTaskData.due_date = formatDateLocal(selectedDate)
        }
        await createTask(newTaskData)
      }
      setShowFormModal(false)
      setEditingTask(null)
      loadMonthTasks(currentYear, currentMonth)
    } catch (err) {
      console.error('Failed to save task:', err)
    }
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

  const formattedSelectedDate = selectedDate
    ? selectedDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    : ''

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">日历视图</h1>
          <p className="text-sm text-gray-500 mt-1">在日历上查看任务分布</p>
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

      <div className="flex-1 flex gap-6 p-6 overflow-hidden">
        <div className="flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-lg p-5 w-80 border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="text-center">
                <span className="text-xl font-bold text-gray-800">{monthNames[currentMonth]}</span>
                <span className="text-sm text-gray-400 ml-1">{currentYear}年</span>
              </div>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day, i) => (
                <div key={day} className={`text-center text-xs font-medium py-2 ${i === 0 || i === 6 ? 'text-red-400' : 'text-gray-400'}`}>
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startingDay }).map((_, i) => (
                <div key={`empty-${i}`} className="h-10" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dayTasks = getTasksForDay(day)
                const today = isToday(day)
                const selected = isSelected(day)
                const dayOfWeek = new Date(currentYear, currentMonth, day).getDay()
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

                return (
                  <button
                    key={day}
                    onClick={() => handleDateSelect(day)}
                    className={`h-10 w-full flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-all ${
                      selected
                        ? 'bg-blue-500 text-white'
                        : today
                        ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-300'
                        : isWeekend
                        ? 'text-red-400 hover:bg-gray-50'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {day}
                    {dayTasks.length > 0 && !selected && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayTasks.slice(0, 3).map(t => (
                          <span key={t.id} className={`w-1 h-1 rounded-full ${statusColors[t.status]}`} />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedDate ? formattedSelectedDate : '请选择日期'}
              </h2>
              {selectedDate && (
                <span className="text-sm text-gray-500">{selectedDateTasks.length} 个任务</span>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="text-center py-8 text-gray-400">加载中...</div>
              ) : selectedDateTasks.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-gray-500 mb-3">该日期没有任务</p>
                  <button onClick={handleCreateTask} className="text-blue-500 hover:text-blue-600 font-medium text-sm">
                    添加任务
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDateTasks.map(task => (
                    <TaskCard key={task.id} task={task} onClick={handleTaskClick} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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

export default CalendarPage
