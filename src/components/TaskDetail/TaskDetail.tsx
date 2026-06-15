import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Task, TaskHistory, ActivityTimelineItem, SubtaskCounts, NewTask } from '../../types'
import { imageApi, taskApi, clipboardApi, ocrApi } from '../../ipc/tasks'
import { DatePicker } from '../DatePicker'
import ImageViewer from '../ImageViewer'
import { ConfirmDialog } from '../ConfirmDialog'
import Modal from '../Modal'
import TaskForm from '../TaskForm'

interface OcrProgress {
  status: string
  progress: number
  message: string
}

const OcrProgressBar = React.memo<{ progress: OcrProgress | null; showComplete: boolean }>(({ progress, showComplete }) => {
  if (!progress && !showComplete) return null
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-all duration-300 ${
      progress?.status === 'downloading' || progress?.status === 'recognizing'
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : showComplete
          ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    }`}>
      {progress?.status === 'downloading' || progress?.status === 'recognizing' ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span>{progress.message}</span>
          <span className="text-blue-500">({progress.progress}%)</span>
        </>
      ) : (
        <span>{progress?.message || '识别完成'}</span>
      )}
    </div>
  )
})

OcrProgressBar.displayName = 'OcrProgressBar'

interface ImageOCRInfo {
  id: number
  task_id: number
  image_path: string
  text_content: string | null
  ocr_status: string
  ocr_error: string | null
  ocr_timestamp: string | null
  created_at: string
}

interface TaskDetailProps {
  task: Task
  onDelete: (id: number) => void
  onUpdate: (task: Task) => void
  onNavigateToTask?: (taskId: number) => void
}

function insertImageIntoDescription(
  currentDescription: string | null,
  imageFileName: string,
  savedPath: string
): string {
  const imageRef = `![${imageFileName}](local://${savedPath})`
  const textOnlyDescription = currentDescription?.replace(/!\[.*?\]\(.*?\)/g, '').trim() || ''

  if (textOnlyDescription) {
    return `${textOnlyDescription}\n\n${imageRef}`
  } else {
    return imageRef
  }
}

async function saveAndInsertImage(
  imageData: string,
  fileName: string,
  task: Task,
  onUpdate: (task: Task) => void
): Promise<boolean> {
  try {
    const savedPath = await imageApi.save(imageData, fileName, task.id)
    if (savedPath) {
      const updatedDescription = insertImageIntoDescription(task.description, fileName, savedPath)
      onUpdate({ ...task, description: updatedDescription })
      return true
    }
    return false
  } catch (error) {
    console.error('Failed to insert image:', error)
    return false
  }
}

const TaskDetail: React.FC<TaskDetailProps> = ({
  task,
  onDelete,
  onUpdate,
  onNavigateToTask,
}) => {
  const [newContent, setNewContent] = useState('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null)
  const [showOcrComplete, setShowOcrComplete] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const taskRef = useRef(task)
  const isProcessingRef = useRef(false)
  
  useEffect(() => {
    taskRef.current = task
  }, [task])
  
  const [history, setHistory] = useState<TaskHistory[]>([])
  const [_historyLoading, setHistoryLoading] = useState(false)
  const [_historyError, setHistoryError] = useState<string | null>(null)
  const [_hasMoreHistory, setHasMoreHistory] = useState(false)
  const [_loadingMore, setLoadingMore] = useState(false)
  const HISTORY_PAGE_SIZE = 20
  const [editingHistoryId, setEditingHistoryId] = useState<number | null>(null)
  const [editingHistoryContent, setEditingHistoryContent] = useState('')
  const [deleteHistoryId, setDeleteHistoryId] = useState<number | null>(null)

  // 子任务相关状态
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [subtaskCounts, setSubtaskCounts] = useState<SubtaskCounts>({ total: 0, completed: 0 })
  const [subtaskLoading, setSubtaskLoading] = useState(false)
  const [hoveredSubtaskId, setHoveredSubtaskId] = useState<number | null>(null)
  const [showSubtaskDetail, setShowSubtaskDetail] = useState(false)
  const [selectedSubtask, setSelectedSubtask] = useState<Task | null>(null)
  const [showNewSubtaskForm, setShowNewSubtaskForm] = useState(false)
  const [deleteSubtaskId, setDeleteSubtaskId] = useState<number | null>(null)

  // 活动时间线相关状态
  const [activityTimeline, setActivityTimeline] = useState<ActivityTimelineItem[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false)
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false)

  useEffect(() => {
    if (window.electronAPI?.onOcrProgress) {
      window.electronAPI.onOcrProgress((progress) => {
        setOcrProgress(progress)
        if (progress.status === 'complete') {
          setShowOcrComplete(true)
          setTimeout(() => {
            setShowOcrComplete(false)
            setOcrProgress(null)
          }, 2000)
        } else if (progress.status === 'error') {
          setTimeout(() => setOcrProgress(null), 3000)
        }
      })
    }
    return () => {
      if (window.electronAPI?.removeOcrProgressListener) {
        window.electronAPI.removeOcrProgressListener()
      }
    }
  }, [])

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (isProcessingRef.current) {
      return
    }
    
    isProcessingRef.current = true
    
    try {
      const currentTask = taskRef.current
      const items = e.clipboardData?.items
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault()
            const file = item.getAsFile()
            if (file) {
              const reader = new FileReader()
              reader.onload = async (event) => {
                const base64 = event.target?.result as string
                if (base64) {
                  const success = await saveAndInsertImage(base64, file.name, currentTask, onUpdate)
                  if (success) {
                    setPasteStatus('success')
                    setTimeout(() => setPasteStatus('idle'), 2000)
                  }
                }
                isProcessingRef.current = false
              }
              reader.readAsDataURL(file)
              return
            }
          }
        }
      }

      try {
        const result = await clipboardApi.readImage()
        if (result.image) {
          const success = await saveAndInsertImage(result.image, 'pasted-image.png', currentTask, onUpdate)
          if (success) {
            setPasteStatus('success')
            setTimeout(() => setPasteStatus('idle'), 2000)
          }
        }
      } catch (error) {
        console.error('Failed to paste image:', error)
        setPasteStatus('error')
        setTimeout(() => setPasteStatus('idle'), 2000)
      }
    } finally {
      isProcessingRef.current = false
    }
  }, [onUpdate])

  useEffect(() => {
    const pasteHandler = (e: Event) => handlePaste(e as ClipboardEvent)
    window.addEventListener('paste', pasteHandler)
    return () => {
      window.removeEventListener('paste', pasteHandler)
    }
  }, [handlePaste])

  const loadHistory = useCallback(async (offset: number = 0, append: boolean = false) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setHistoryLoading(true)
    }
    setHistoryError(null)
    try {
      const data = await taskApi.getHistory(task.id, { limit: HISTORY_PAGE_SIZE + 1, offset })
      if (data.length > HISTORY_PAGE_SIZE) {
        setHasMoreHistory(true)
        data.pop()
      } else {
        setHasMoreHistory(false)
      }
      if (append) {
        setHistory(prev => [...prev, ...data])
      } else {
        setHistory(data)
      }
    } catch (err) {
      console.error('[loadHistory] Failed to load task history:', err)
      setHistoryError(err instanceof Error ? err.message : '加载历史记录失败')
    } finally {
      setHistoryLoading(false)
      setLoadingMore(false)
    }
  }, [task.id])

  useEffect(() => {
    loadHistory()
  }, [task.id, task.updated_at, loadHistory])

  const loadSubtasks = useCallback(async () => {
    setSubtaskLoading(true)
    try {
      const [subtaskList, counts] = await Promise.all([
        taskApi.listSubtasks(task.id),
        taskApi.getSubtaskCounts(task.id)
      ])
      setSubtasks(subtaskList)
      setSubtaskCounts(counts)
    } catch (err) {
      console.error('Failed to load subtasks:', err)
    } finally {
      setSubtaskLoading(false)
    }
  }, [task.id])

  const loadActivityTimeline = useCallback(async (offset: number = 0, append: boolean = false) => {
    if (append) {
      setLoadingMoreTimeline(true)
    } else {
      setTimelineLoading(true)
    }
    try {
      const data = await taskApi.getActivityTimeline(task.id, { limit: 21, offset })
      if (data.length > 20) {
        setHasMoreTimeline(true)
        data.pop()
      } else {
        setHasMoreTimeline(false)
      }
      if (append) {
        setActivityTimeline(prev => [...prev, ...data])
      } else {
        setActivityTimeline(data)
      }
    } catch (err) {
      console.error('Failed to load activity timeline:', err)
    } finally {
      setTimelineLoading(false)
      setLoadingMoreTimeline(false)
    }
  }, [task.id])

  useEffect(() => {
    loadSubtasks()
  }, [task.id, task.updated_at, loadSubtasks])

  useEffect(() => {
    loadActivityTimeline()
  }, [task.id, task.updated_at, loadActivityTimeline])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'Z')
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai'
    })
  }

  const getPriorityColor = (priority: Task['priority']) => {
    const colors = {
      high: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30',
      medium: 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30',
      low: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30',
    }
    return colors[priority]
  }

  const getStatusColor = (status: Task['status']) => {
    const colors = {
      pending: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700',
      in_progress: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30',
      completed: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
      cancelled: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
    }
    return colors[status]
  }

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      created: '创建任务',
      updated: '更新任务',
      status_changed: '状态变更',
      priority_changed: '优先级变更',
      deleted: '删除任务',
    }
    return labels[action] || action
  }

  const handleStatusChange = (newStatus: Task['status']) => {
    const updatedTask = { ...task, status: newStatus }
    onUpdate(updatedTask)
  }

  const handlePriorityChange = (newPriority: Task['priority']) => {
    const updatedTask = { ...task, priority: newPriority }
    onUpdate(updatedTask)
  }

  const handleDueDateChange = (newDate: string) => {
    const updatedTask = { ...task, due_date: newDate || null }
    onUpdate(updatedTask)
  }

  const handleAddContent = async () => {
    if (!newContent.trim()) return
    
    const updatedTask = { ...task, description: newContent.trim() }
    await onUpdate(updatedTask)
    setNewContent('')
    loadHistory()
    loadActivityTimeline()
  }

  const handleDeleteHistory = async (historyId: number) => {
    setDeleteHistoryId(historyId)
  }

  const confirmDeleteHistory = async () => {
    if (deleteHistoryId === null) return
    try {
      await taskApi.deleteHistory(deleteHistoryId)
      loadHistory()
      loadActivityTimeline()
    } catch (err) {
      console.error('Failed to delete history:', err)
    } finally {
      setDeleteHistoryId(null)
    }
  }

  const handleStartEditHistory = (item: TaskHistory) => {
    setEditingHistoryId(item.id)
    // 从 JSON 中提取 description 文本，而非显示原始 JSON
    try {
      const parsed = item.new_value ? JSON.parse(item.new_value) : {}
      if (parsed.description !== undefined) {
        setEditingHistoryContent(parsed.description || '')
      } else {
        setEditingHistoryContent(item.new_value || '')
      }
    } catch {
      setEditingHistoryContent(item.new_value || '')
    }
  }

  const handleSaveEditHistory = async () => {
    if (editingHistoryId === null) return
    try {
      // 找到当前编辑的历史记录，更新其 new_value 中的 description 字段
      const currentItem = history.find(h => h.id === editingHistoryId)
      let newValue = editingHistoryContent
      if (currentItem?.new_value) {
        try {
          const parsed = JSON.parse(currentItem.new_value)
          if (parsed.description !== undefined) {
            parsed.description = editingHistoryContent
            newValue = JSON.stringify(parsed)
          }
        } catch {
          // new_value 不是 JSON，直接使用编辑内容
        }
      }
      await taskApi.updateHistory(editingHistoryId, newValue)
      setEditingHistoryId(null)
      setEditingHistoryContent('')
      loadHistory()
      loadActivityTimeline()
    } catch (err) {
      console.error('Failed to update history:', err)
    }
  }

  const handleCancelEditHistory = () => {
    setEditingHistoryId(null)
    setEditingHistoryContent('')
  }

  const handleSubtaskStatusToggle = async (subtask: Task) => {
    const newStatus = subtask.status === 'completed' ? 'in_progress' : 'completed'
    try {
      await taskApi.update(subtask.id, { status: newStatus })
      loadSubtasks()
      loadActivityTimeline()
      // 通知父组件刷新（触发 TaskCard 子任务进度更新）
      onUpdate(task)
    } catch (err) {
      console.error('Failed to toggle subtask status:', err)
    }
  }

  const handleSubtaskClick = async (subtaskId: number) => {
    try {
      const subtask = await taskApi.get(subtaskId)
      if (subtask) {
        setSelectedSubtask(subtask)
        setShowSubtaskDetail(true)
      }
    } catch (err) {
      console.error('Failed to load subtask detail:', err)
    }
  }

  const handleDeleteSubtask = async () => {
    if (deleteSubtaskId === null) return
    try {
      await taskApi.delete(deleteSubtaskId)
      setDeleteSubtaskId(null)
      loadSubtasks()
      loadActivityTimeline()
      onUpdate(task)
    } catch (err) {
      console.error('Failed to delete subtask:', err)
    }
  }

  const handleCreateSubtask = async (data: NewTask | any) => {
    try {
      await taskApi.create({ ...data, parent_id: task.id })
      setShowNewSubtaskForm(false)
      loadSubtasks()
      loadActivityTimeline()
      onUpdate(task)
    } catch (err) {
      console.error('Failed to create subtask:', err)
    }
  }

  const handleSubtaskUpdate = async (updatedSubtask: Task) => {
    try {
      await taskApi.update(updatedSubtask.id, {
        title: updatedSubtask.title,
        description: updatedSubtask.description ?? undefined,
        status: updatedSubtask.status,
        priority: updatedSubtask.priority,
        due_date: updatedSubtask.due_date ?? undefined,
      })
      const latestSubtask = await taskApi.get(updatedSubtask.id)
      if (latestSubtask) {
        setSelectedSubtask(latestSubtask)
      }
      loadSubtasks()
      loadActivityTimeline()
    } catch (err) {
      console.error('Failed to update subtask:', err)
    }
  }

  const handleSubtaskDelete = async (id: number) => {
    try {
      await taskApi.delete(id)
      setShowSubtaskDetail(false)
      setSelectedSubtask(null)
      loadSubtasks()
      loadActivityTimeline()
    } catch (err) {
      console.error('Failed to delete subtask:', err)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleAddContent()
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (isProcessingRef.current) {
      return
    }
    
    isProcessingRef.current = true
    const currentTask = taskRef.current

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      isProcessingRef.current = false
      return
    }

    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const base64 = event.target?.result as string
        if (!base64) return

        await saveAndInsertImage(base64, file.name, currentTask, onUpdate)
        isProcessingRef.current = false
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('handleImageSelect error:', error)
      isProcessingRef.current = false
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCopyImage = async () => {
    if (!previewImage) return
    
    try {
      const result = await clipboardApi.writeImage(previewImage)
      if (result.success) {
        setCopyStatus('success')
      } else {
        setCopyStatus('error')
      }
    } catch {
      setCopyStatus('error')
    }
    
    setTimeout(() => {
      setCopyStatus('idle')
    }, 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{task.title}</h2>
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as Task['status'])}
            className={`px-3 py-1 rounded-lg text-sm font-medium cursor-pointer border-0 focus:ring-2 focus:ring-blue-500 ${getStatusColor(task.status)}`}
          >
            <option value="pending">待处理</option>
            <option value="in_progress">进行中</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">优先级</h3>
          <select
            value={task.priority}
            onChange={(e) => handlePriorityChange(e.target.value as Task['priority'])}
            className={`px-3 py-1 rounded-lg text-sm font-medium cursor-pointer border-0 focus:ring-2 focus:ring-blue-500 ${getPriorityColor(task.priority)}`}
          >
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">截止日期</h3>
          <DatePicker
            value={task.due_date || ''}
            onChange={handleDueDateChange}
            placeholder="选择日期"
            className="w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">创建时间</h3>
          <p className="text-gray-700 dark:text-gray-300">{formatDate(task.created_at)}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">更新时间</h3>
          <p className="text-gray-700 dark:text-gray-300">{formatDate(task.updated_at)}</p>
        </div>
      </div>

      {task.description && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">描述</h3>
          <TaskDescription description={task.description} onImageClick={setPreviewImage} taskId={task.id} />
        </div>
      )}

      {/* 子任务区域 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            子任务 {subtaskCounts.total > 0 && `(${subtaskCounts.completed}/${subtaskCounts.total})`}
          </h3>
        </div>
        
        {subtaskCounts.total > 0 && (
          <div className="mb-3">
            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-300" 
                style={{ width: `${(subtaskCounts.completed / subtaskCounts.total) * 100}%` }}
              />
            </div>
          </div>
        )}
        
        {subtaskLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          </div>
        ) : subtasks.length > 0 ? (
          <div className="space-y-2 mb-3">
            {subtasks.map(subtask => (
              <div
                key={subtask.id}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group cursor-pointer"
                onMouseEnter={() => setHoveredSubtaskId(subtask.id)}
                onMouseLeave={() => setHoveredSubtaskId(null)}
              >
                <input
                  type="checkbox"
                  checked={subtask.status === 'completed'}
                  onChange={(e) => {
                    e.stopPropagation()
                    handleSubtaskStatusToggle(subtask)
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <div 
                  className="flex-1 min-w-0"
                  onClick={() => handleSubtaskClick(subtask.id)}
                >
                  <p className={`text-sm font-medium truncate ${subtask.status === 'completed' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                    {subtask.title}
                  </p>
                  {subtask.description && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      {subtask.description.replace(/!\[.*?\]\(.*?\)/g, '').trim().substring(0, 60)}
                    </p>
                  )}
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  subtask.status === 'completed' ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                  subtask.status === 'in_progress' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                  subtask.status === 'pending' ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {subtask.status === 'completed' ? '已完成' : subtask.status === 'in_progress' ? '进行中' : subtask.status === 'pending' ? '待处理' : '已取消'}
                </span>
                
                {hoveredSubtaskId === subtask.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSubtaskStatusToggle(subtask) }}
                      className="px-2 py-1 text-xs text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                    >
                      {subtask.status === 'completed' ? '重开' : '完成'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSubtaskClick(subtask.id) }}
                      className="px-2 py-1 text-xs text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      编辑
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteSubtaskId(subtask.id) }}
                      className="px-2 py-1 text-xs text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}
        
        <button
          onClick={() => setShowNewSubtaskForm(true)}
          className="w-full py-2 text-sm text-blue-500 hover:text-blue-600 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
        >
          + 新建子任务
        </button>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">活动时间线</h3>
        
        <div className="mb-3">
          <div className="flex gap-2">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="添加新的更新内容..."
              rows={3}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              style={{ minHeight: '80px', maxHeight: '200px', overflowY: 'auto' }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="插入图片"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            <OcrProgressBar progress={ocrProgress} showComplete={showOcrComplete} />
            <button
              onClick={handleAddContent}
              disabled={!newContent.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              添加
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">提示：按 Ctrl+V 可直接粘贴图片</span>
            {pasteStatus === 'success' && (
              <span className="text-xs text-green-600 dark:text-green-400">图片已粘贴</span>
            )}
            {pasteStatus === 'error' && (
              <span className="text-xs text-red-600 dark:text-red-400">粘贴失败</span>
            )}
          </div>
        </div>

        {timelineLoading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">加载活动时间线...</span>
          </div>
        )}

        {!timelineLoading && activityTimeline.length > 0 && (
          <div className="space-y-2">
            {activityTimeline.map((item) => {
              const isParentTask = item.source_parent_id === null || item.source_task_id === task.id
              const isSubtaskCreated = item.action === 'created' && item.source_parent_id !== null && item.source_task_id !== task.id
              
              let changeText = ''
              let addedImages: string[] = []
              
              if (item.action === 'created') {
                try {
                  const newValue = item.new_value ? JSON.parse(item.new_value) : {}
                  const changes: string[] = ['创建了任务']
                  
                  if (newValue.description) {
                    const localImgPaths = newValue.description.match(/!\[.*?\]\(local:\/\/[^)]+\)/g) || []
                    const dataUrlImages = newValue.description.match(/!\[.*?\]\(data:image\/[^)]+\)/g) || []
                    addedImages = [...localImgPaths, ...dataUrlImages]
                    
                    const textContent = newValue.description
                      .replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '')
                      .replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '')
                      .trim()
                    
                    if (textContent) {
                      changes.push(textContent)
                    }
                  }
                  changeText = changes.join('：')
                } catch {
                  changeText = '创建了任务'
                }
              } else if (item.action === 'updated') {
                try {
                  const oldValue = item.old_value ? JSON.parse(item.old_value) : {}
                  const newValue = item.new_value ? JSON.parse(item.new_value) : {}
                  const changes: string[] = []
                  
                  if (oldValue.title !== newValue.title && newValue.title) {
                    changes.push(`标题改为"${newValue.title}"`)
                  }
                  if (oldValue.description !== newValue.description) {
                    if (newValue.description) {
                      const oldLocalImgPaths = oldValue.description?.match(/!\[.*?\]\(local:\/\/[^)]+\)/g) || []
                      const oldDataUrlImages = oldValue.description?.match(/!\[.*?\]\(data:image\/[^)]+\)/g) || []
                      const oldImages = new Set([...oldLocalImgPaths, ...oldDataUrlImages])
                      
                      const newLocalImgPaths = newValue.description.match(/!\[.*?\]\(local:\/\/[^)]+\)/g) || []
                      const newDataUrlImages = newValue.description.match(/!\[.*?\]\(data:image\/[^)]+\)/g) || []
                      const allNewImages = [...newLocalImgPaths, ...newDataUrlImages]
                      
                      addedImages = allNewImages.filter(img => !oldImages.has(img))
                      
                      const oldTextContent = oldValue.description?.replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '').replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '').trim() || ''
                      const newTextContent = newValue.description.replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '').replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '').trim()
                      
                      if (newTextContent && newTextContent !== oldTextContent) {
                        changes.push(newTextContent)
                      }
                      if (addedImages.length > 0) {
                        changes.push(`添加了${addedImages.length}张图片`)
                      }
                    } else {
                      changes.push('清空了描述')
                    }
                  }
                  if (oldValue.status !== newValue.status && newValue.status) {
                    const statusLabels: Record<string, string> = {
                      pending: '待处理',
                      in_progress: '进行中',
                      completed: '已完成',
                      cancelled: '已取消'
                    }
                    changes.push(`状态改为"${statusLabels[newValue.status] || newValue.status}"`)
                  }
                  if (oldValue.priority !== newValue.priority && newValue.priority) {
                    const priorityLabels: Record<string, string> = {
                      high: '高',
                      medium: '中',
                      low: '低'
                    }
                    changes.push(`优先级改为"${priorityLabels[newValue.priority] || newValue.priority}"`)
                  }
                  
                  changeText = changes.length > 0 ? changes.join('，') : '更新了任务'
                } catch {
                  changeText = '更新了任务'
                }
              } else if (item.action === 'status_changed') {
                try {
                  const newValue = item.new_value ? JSON.parse(item.new_value) : {}
                  const statusLabels: Record<string, string> = {
                    pending: '待处理',
                    in_progress: '进行中',
                    completed: '已完成',
                    cancelled: '已取消'
                  }
                  const statusText = newValue.status ? statusLabels[newValue.status] || newValue.status : ''
                  changeText = `状态改为"${statusText}"`
                } catch {
                  changeText = `状态变更为 ${item.new_value || ''}`
                }
              } else if (item.action === 'priority_changed') {
                try {
                  const newValue = item.new_value ? JSON.parse(item.new_value) : {}
                  const priorityLabels: Record<string, string> = {
                    high: '高',
                    medium: '中',
                    low: '低'
                  }
                  const priorityText = newValue.priority ? priorityLabels[newValue.priority] || newValue.priority : ''
                  changeText = `优先级改为"${priorityText}"`
                } catch {
                  changeText = `优先级变更为 ${item.new_value || ''}`
                }
              } else {
                changeText = getActionLabel(item.action)
              }
              
              let borderColor = ''
              let icon = ''
              let sourcePrefix = ''
              
              if (!isParentTask) {
                if (isSubtaskCreated) {
                  borderColor = 'border-l-2 border-l-green-400'
                  icon = '➕'
                  sourcePrefix = `创建子任务"${item.source_task_title}"`
                  changeText = ''
                } else if (item.action === 'status_changed') {
                  borderColor = 'border-l-2 border-l-orange-400'
                  icon = '🔄'
                  sourcePrefix = `${item.source_task_title} ·`
                } else {
                  borderColor = 'border-l-2 border-l-blue-400'
                  icon = '📋'
                  sourcePrefix = `${item.source_task_title} ·`
                }
              }
              
              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 text-sm py-2 border-b border-gray-100 dark:border-gray-700 last:border-0 group ${borderColor} pl-2`}
                >
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <div className="flex-1">
                    {editingHistoryId === item.id ? (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <textarea
                          value={editingHistoryContent}
                          onChange={(e) => setEditingHistoryContent(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSaveEditHistory() }}
                            className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-xs"
                          >
                            保存
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCancelEditHistory() }}
                            className="px-3 py-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-xs"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {sourcePrefix && (
                          <span 
                            className="text-xs font-medium text-blue-500 hover:text-blue-600 cursor-pointer"
                            onClick={() => item.source_task_id !== task.id && handleSubtaskClick(item.source_task_id)}
                          >
                            {icon} {sourcePrefix}{' '}
                          </span>
                        )}
                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{changeText}</p>
                        {addedImages.length > 0 && (
                          <HistoryImages addedImages={addedImages} onImageClick={setPreviewImage} taskId={task.id} />
                        )}
                      </>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-gray-400 dark:text-gray-500 text-xs">{formatDate(item.timestamp)}</p>
                      {editingHistoryId !== item.id && (
                        <div className="hidden group-hover:flex items-center gap-1">
                          <button
                            onClick={() => handleStartEditHistory(item as unknown as TaskHistory)}
                            className="text-gray-400 dark:text-gray-500 hover:text-blue-500 text-xs"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDeleteHistory(item.id)}
                            className="text-gray-400 dark:text-gray-500 hover:text-red-500 text-xs"
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {hasMoreTimeline && (
              <button
                onClick={() => loadActivityTimeline(activityTimeline.length, true)}
                disabled={loadingMoreTimeline}
                className="w-full py-2 text-sm text-blue-500 hover:text-blue-600 disabled:text-gray-400 dark:disabled:text-gray-500 transition-colors"
              >
                {loadingMoreTimeline ? '加载中...' : '加载更多'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => onDelete(task.id)}
          className="px-4 py-2 text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
        >
          删除
        </button>
      </div>

      {previewImage && (
        <ImageViewer
          src={previewImage}
          alt="预览图片"
          onClose={() => {
            setPreviewImage(null)
            setCopyStatus('idle')
          }}
          onCopy={handleCopyImage}
          copyStatus={copyStatus}
        />
      )}

      <ConfirmDialog
        isOpen={deleteHistoryId !== null}
        title="删除历史记录"
        message="确定要删除这条历史记录吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={confirmDeleteHistory}
        onCancel={() => setDeleteHistoryId(null)}
        variant="danger"
      />

      {/* 子任务详情弹窗 */}
      {showSubtaskDetail && selectedSubtask && (
        <Modal
          isOpen={showSubtaskDetail}
          onClose={() => { setShowSubtaskDetail(false); setSelectedSubtask(null); loadSubtasks(); loadActivityTimeline(); }}
          title="子任务详情"
        >
          {/* 面包屑导航 */}
          <div className="flex items-center gap-2 mb-4 text-sm">
            <button 
              className="text-blue-500 hover:text-blue-600"
              onClick={() => {
                setShowSubtaskDetail(false)
                setSelectedSubtask(null)
                if (onNavigateToTask) {
                  onNavigateToTask(task.id)
                }
              }}
            >
              {task.title}
            </button>
            <span className="text-gray-400">/</span>
            <span className="text-gray-700 dark:text-gray-300">{selectedSubtask.title}</span>
          </div>
          <TaskDetail
            task={selectedSubtask}
            onDelete={handleSubtaskDelete}
            onUpdate={handleSubtaskUpdate}
            onNavigateToTask={(targetTaskId) => {
              if (targetTaskId === task.id) {
                setShowSubtaskDetail(false)
                setSelectedSubtask(null)
              } else {
                handleSubtaskClick(targetTaskId)
              }
            }}
          />
        </Modal>
      )}

      {/* 新建子任务表单弹窗 */}
      {showNewSubtaskForm && (
        <Modal
          isOpen={showNewSubtaskForm}
          onClose={() => setShowNewSubtaskForm(false)}
          title="新建子任务"
        >
          <TaskForm
            onSubmit={handleCreateSubtask}
            onCancel={() => setShowNewSubtaskForm(false)}
          />
        </Modal>
      )}

      {/* 删除子任务确认对话框 */}
      <ConfirmDialog
        isOpen={deleteSubtaskId !== null}
        title="删除子任务"
        message="确定要删除这个子任务吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleDeleteSubtask}
        onCancel={() => setDeleteSubtaskId(null)}
        variant="danger"
      />
    </div>
  )
}

const TaskDescription: React.FC<{ description: string; onImageClick: (url: string) => void; taskId: number }> = ({ description, onImageClick, taskId }) => {
  const [images, setImages] = useState<{ path: string; dataUrl: string; error: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [ocrInfo, setOcrInfo] = useState<Map<string, ImageOCRInfo>>(new Map())
  const [retrying, setRetrying] = useState<string | null>(null)

  useEffect(() => {
    const loadImages = async () => {
      try {
        setLoading(true)
        const loaded: { path: string; dataUrl: string; error: boolean }[] = []
        
        const localRegex = /!\[.*?\]\(local:\/\/([^)]+)\)/g
        let match
        const localPaths: string[] = []
        while ((match = localRegex.exec(description)) !== null) {
          localPaths.push(match[1])
        }
        
        for (const path of localPaths) {
          try {
            const dataUrl = await imageApi.load(path)
            if (dataUrl) {
              loaded.push({ path, dataUrl, error: false })
            } else {
              loaded.push({ path, dataUrl: '', error: true })
            }
          } catch {
            loaded.push({ path, dataUrl: '', error: true })
          }
        }
        
        setImages(loaded)
        
        if (taskId) {
          try {
            const ocrData = await ocrApi.getTaskImageInfo(taskId)
            const ocrMap = new Map<string, ImageOCRInfo>()
            ocrData.forEach(info => ocrMap.set(info.image_path, info))
            setOcrInfo(ocrMap)
          } catch (e) {
            console.error('Failed to load OCR info:', e)
          }
        }
      } catch (e) {
        console.error('Failed to load description images:', e)
      } finally {
        setLoading(false)
      }
    }
    loadImages()
  }, [description, taskId])

  const handleRetryOCR = async (imagePath: string) => {
    setRetrying(imagePath)
    try {
      await ocrApi.retry(taskId, imagePath)
      const ocrData = await ocrApi.getTaskImageInfo(taskId)
      const ocrMap = new Map<string, ImageOCRInfo>()
      ocrData.forEach(info => ocrMap.set(info.image_path, info))
      setOcrInfo(ocrMap)
    } catch (e) {
      console.error('Failed to retry OCR:', e)
    } finally {
      setRetrying(null)
    }
  }

  const textContent = description
    .replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '')
    .replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '')
    .trim()

  const getOCRStatusBadge = (info: ImageOCRInfo | undefined) => {
    if (!info) {
      return <span className="text-xs text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-700 px-1.5 py-0.5 rounded">待识别</span>
    }
    if (info.ocr_status === 'success') {
      return <span className="text-xs text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30 px-1.5 py-0.5 rounded">识别成功</span>
    }
    if (info.ocr_status === 'failed') {
      return <span className="text-xs text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30 px-1.5 py-0.5 rounded">识别失败</span>
    }
    return <span className="text-xs text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded">识别中</span>
  }

  return (
    <div className="text-sm text-gray-700 dark:text-gray-300">
      {textContent && <p className="whitespace-pre-wrap">{textContent}</p>}
      {loading && images.length === 0 && description.includes('![') && (
        <div className="flex gap-1 mt-2">
          <div className="w-16 h-16 bg-gray-100 rounded animate-pulse"></div>
        </div>
      )}
      {images.length > 0 && (
        <div className="mt-2 space-y-2">
          {images.map((img, idx) => {
            const info = ocrInfo.get(img.path)
            return (
              <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                <div className="flex items-start gap-3">
                  {img.error ? (
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded flex items-center justify-center flex-shrink-0">
                      <span className="text-red-400 text-xs">加载失败</span>
                    </div>
                  ) : (
                    <img
                      src={img.dataUrl}
                      alt={`图片 ${idx + 1}`}
                      className="w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onImageClick(img.dataUrl)
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getOCRStatusBadge(info)}
                      {info && info.ocr_timestamp && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(info.ocr_timestamp).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                    {info && info.text_content && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1" title={info.text_content}>
                        {info.text_content.substring(0, 100)}{info.text_content.length > 100 ? '...' : ''}
                      </p>
                    )}
                    {info && info.ocr_error && (
                      <p className="text-xs text-red-500 dark:text-red-400 mb-1">{info.ocr_error}</p>
                    )}
                    <button
                      onClick={() => handleRetryOCR(img.path)}
                      disabled={retrying === img.path}
                      className="text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400 dark:text-blue-400 dark:hover:text-blue-300 dark:disabled:text-gray-500"
                    >
                      {retrying === img.path ? '重新识别中...' : '重新识别'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const HistoryImages = React.memo<{ addedImages: string[]; onImageClick: (url: string) => void; taskId: number }>(
  ({ addedImages, onImageClick, taskId }) => {
    const [historyImages, setHistoryImages] = useState<{ path: string; dataUrl: string; error: boolean }[]>([])
    const [loading, setLoading] = useState(true)
    const [ocrInfo, setOcrInfo] = useState<Map<string, ImageOCRInfo>>(new Map())
    const [retrying, setRetrying] = useState<string | null>(null)
    const loadedRef = useRef(false)

    const getOCRStatusBadge = (info: ImageOCRInfo | undefined) => {
      if (!info) {
        return <span className="text-xs text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-700 px-1 rounded">待识别</span>
      }
      if (info.ocr_status === 'success') {
        return <span className="text-xs text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30 px-1 rounded">成功</span>
      }
      if (info.ocr_status === 'failed') {
        return <span className="text-xs text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30 px-1 rounded">失败</span>
      }
      return <span className="text-xs text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30 px-1 rounded">中</span>
    }

    const handleRetryOCR = async (imagePath: string) => {
      setRetrying(imagePath)
      try {
        await ocrApi.retry(taskId, imagePath)
        const ocrData = await ocrApi.getTaskImageInfo(taskId)
        const ocrMap = new Map<string, ImageOCRInfo>()
        ocrData.forEach(info => ocrMap.set(info.image_path, info))
        setOcrInfo(ocrMap)
      } catch (e) {
        console.error('Failed to retry OCR:', e)
      } finally {
        setRetrying(null)
      }
    }

    useEffect(() => {
      if (loadedRef.current) return
      loadedRef.current = true
      
      const loadHistoryImages = async () => {
        try {
          setLoading(true)
          const loaded: { path: string; dataUrl: string; error: boolean }[] = []
          
          for (const imgRef of addedImages.slice(0, 3)) {
            const localMatch = imgRef.match(/!\[.*?\]\(local:\/\/([^)]+)\)/)
            if (localMatch) {
              const path = localMatch[1]
              try {
                const dataUrl = await imageApi.load(path)
                if (dataUrl) {
                  loaded.push({ path, dataUrl, error: false })
                } else {
                  loaded.push({ path, dataUrl: '', error: true })
                }
              } catch {
                loaded.push({ path, dataUrl: '', error: true })
              }
              continue
            }
            
            const dataUrlMatch = imgRef.match(/!\[.*?\]\((data:image\/[^)]+)\)/)
            if (dataUrlMatch) {
              loaded.push({ path: dataUrlMatch[1].substring(0, 50), dataUrl: dataUrlMatch[1], error: false })
            }
          }
          
          setHistoryImages(loaded)
          
          if (loaded.length > 0) {
            try {
              const ocrData = await ocrApi.getTaskImageInfo(taskId)
              const ocrMap = new Map<string, ImageOCRInfo>()
              ocrData.forEach(info => ocrMap.set(info.image_path, info))
              setOcrInfo(ocrMap)
            } catch (e) {
              console.error('Failed to load OCR info:', e)
            }
          }
        } catch (e) {
          console.error('Failed to load history images:', e)
        } finally {
          setLoading(false)
        }
      }
      loadHistoryImages()
    }, [addedImages, taskId])

    if (loading) {
      return (
        <div className="flex gap-1 mt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          ))}
        </div>
      )
    }

    if (historyImages.length === 0) return null

    return (
      <div className="mt-2 space-y-1">
        {historyImages.map((img, idx) => {
          const info = ocrInfo.get(img.path)
          return (
            <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-1.5">
              <div className="flex items-center gap-2">
                {img.error ? (
                  <div className="w-10 h-10 bg-red-50 rounded flex items-center justify-center flex-shrink-0">
                    <span className="text-red-400 text-xs">失败</span>
                  </div>
                ) : (
                  <img
                    src={img.dataUrl}
                    alt={`历史图片 ${idx + 1}`}
                    className="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-80 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onImageClick(img.dataUrl)
                    }}
                    onError={() => {
                      setHistoryImages(prev => 
                        prev.map((item, i) => i === idx ? { ...item, error: true } : item)
                      )
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getOCRStatusBadge(info)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRetryOCR(img.path)
                      }}
                      disabled={retrying === img.path}
                      className="text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400 dark:text-blue-400 dark:hover:text-blue-300 dark:disabled:text-gray-500"
                    >
                      {retrying === img.path ? '识别中...' : '重新识别'}
                    </button>
                  </div>
                  {info && info.text_content && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5" title={info.text_content}>
                      {info.text_content.substring(0, 50)}{info.text_content.length > 50 ? '...' : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
)

export default TaskDetail
