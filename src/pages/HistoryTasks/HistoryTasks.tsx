import React, { useState, useEffect, useCallback } from 'react'
import { Task, NewTask, UpdateTask, StatusFilter } from '../../types'
import { taskApi } from '../../ipc/tasks'
import { useTaskContext } from '../../context/TaskContext'
import TaskCard from '../../components/TaskCard'
import TaskForm from '../../components/TaskForm'
import TaskDetail from '../../components/TaskDetail'
import Modal from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatDateLocal } from '../../utils/dateUtils'

interface HistoryTasksProps {
  statusFilter?: StatusFilter
}

const HistoryTasks: React.FC<HistoryTasksProps> = ({ statusFilter = 'all' }) => {
  const { createTask, updateTask, deleteTask } = useTaskContext()
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
      const today = new Date()
      const filters: { startDate: string; endDate: string; status?: string } = {
        startDate: '2020-01-01',
        endDate: formatDateLocal(today)
      }
      if (statusFilter !== 'all') {
        filters.status = statusFilter
      }
      const taskList = await taskApi.list(filters)
      setTasks(taskList)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务失败')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

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
      await deleteTask(taskToDelete)
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
      await updateTask(updatedTask.id, {
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

  useEffect(() => {
    if (selectedTask) {
      const latestTask = tasks.find(t => t.id === selectedTask.id)
      if (latestTask) {
        setSelectedTask(latestTask)
      }
    }
  }, [tasks, selectedTask?.id])

  const handleFormSubmit = async (data: NewTask | UpdateTask) => {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, data as UpdateTask)
      } else {
        await createTask(data as NewTask)
      }
      setShowFormModal(false)
      setEditingTask(null)
      loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存任务失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">历史任务</h1>
          <p className="text-sm text-gray-500 mt-1">查看所有历史任务记录</p>
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">加载中...</div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-500 mb-4">没有历史任务</p>
          <button
            onClick={handleCreateTask}
            className="text-blue-500 hover:text-blue-600 font-medium"
          >
            创建任务
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
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

export default HistoryTasks
