import React, { useState, useEffect, useRef } from 'react'
import { Task, NewTask, UpdateTask } from '../../types'
import { DatePicker } from '../DatePicker'

interface TaskFormProps {
  task?: Task
  defaultDate?: string
  onSubmit: (data: NewTask | UpdateTask) => void
  onCancel: () => void
}

const TaskForm: React.FC<TaskFormProps> = ({ task, defaultDate, onSubmit, onCancel }) => {
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [status, setStatus] = useState<Task['status']>(task?.status || 'pending')
  const [priority, setPriority] = useState<Task['priority']>(task?.priority || 'medium')
  const [dueDate, setDueDate] = useState(task?.due_date || defaultDate || '')
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setStatus(task.status)
      setPriority(task.priority)
      setDueDate(task.due_date || '')
    } else {
      setTitle('')
      setDescription('')
      setStatus('pending')
      setPriority('medium')
      setDueDate(defaultDate || '')
    }
  }, [task, defaultDate])

  useEffect(() => {
    const timer = setTimeout(() => {
      titleInputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    if (task) {
      onSubmit({
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        due_date: dueDate || undefined,
      })
    } else {
      onSubmit({
        title: title.trim(),
        description: description.trim(),
        priority,
        due_date: dueDate || undefined,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          标题 <span className="text-red-500">*</span>
        </label>
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="输入任务标题..."
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          描述
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          placeholder="输入任务描述..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            状态
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Task['status'])}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="pending">待处理</option>
            <option value="in_progress">进行中</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            优先级
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task['priority'])}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          截止日期
        </label>
        <DatePicker
          value={dueDate}
          onChange={setDueDate}
          placeholder="选择截止日期"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          取消
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          {task ? '保存修改' : '创建任务'}
        </button>
      </div>
    </form>
  )
}

export default TaskForm
