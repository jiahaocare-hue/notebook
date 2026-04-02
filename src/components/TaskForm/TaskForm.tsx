import React, { useState, useEffect, useRef } from 'react'
import { Task, NewTask, UpdateTask } from '../../types'
import { DatePicker } from '../DatePicker'
import { imageApi } from '../../ipc/tasks'

interface TaskFormProps {
  task?: Task
  defaultDate?: string
  onSubmit: (data: NewTask | UpdateTask) => void
  onCancel: () => void
}

interface ImagePreview {
  file: File
  dataUrl: string
}

const TaskForm: React.FC<TaskFormProps> = ({ task, defaultDate, onSubmit, onCancel }) => {
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [status, setStatus] = useState<Task['status']>(task?.status || 'pending')
  const [priority, setPriority] = useState<Task['priority']>(task?.priority || 'medium')
  const [dueDate, setDueDate] = useState(task?.due_date || defaultDate || '')
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setImagePreview(null)
  }, [task, defaultDate])

  useEffect(() => {
    const timer = setTimeout(() => {
      titleInputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      if (dataUrl) {
        setImagePreview({ file, dataUrl })
      }
    }
    reader.readAsDataURL(file)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveImage = () => {
    setImagePreview(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      let finalDescription = description.trim()

      if (imagePreview) {
        const savedPath = await imageApi.save(imagePreview.dataUrl, imagePreview.file.name)
        console.log('[TaskForm] Image saved:', savedPath)
        if (savedPath) {
          const imageRef = `![${imagePreview.file.name}](local://${savedPath})`
          finalDescription = finalDescription 
            ? `${finalDescription}\n\n${imageRef}` 
            : imageRef
          console.log('[TaskForm] Final description:', finalDescription)
        }
      }

      if (task) {
        onSubmit({
          title: title.trim(),
          description: finalDescription,
          status,
          priority,
          due_date: dueDate || undefined,
        })
      } else {
        onSubmit({
          title: title.trim(),
          description: finalDescription,
          priority,
          due_date: dueDate || undefined,
        })
      }
    } catch (error) {
      console.error('Failed to submit task:', error)
      alert('保存任务失败，请重试')
    } finally {
      setIsSubmitting(false)
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
          disabled={isSubmitting}
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
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          图片
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
          disabled={isSubmitting}
        />
        {imagePreview ? (
          <div className="relative inline-block">
            <img
              src={imagePreview.dataUrl}
              alt="预览"
              className="max-w-full h-32 object-cover rounded-lg border border-gray-200"
            />
            <button
              type="button"
              onClick={handleRemoveImage}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
              disabled={isSubmitting}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            disabled={isSubmitting}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>添加图片</span>
          </button>
        )}
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
            disabled={isSubmitting}
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
            disabled={isSubmitting}
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
          disabled={isSubmitting}
        >
          取消
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSubmitting}
        >
          {isSubmitting ? '保存中...' : (task ? '保存修改' : '创建任务')}
        </button>
      </div>
    </form>
  )
}

export default TaskForm
