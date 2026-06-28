import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Task, TaskHistory, ActivityTimelineItem, SubtaskCounts, NewTask } from '../../types'
import { taskApi, clipboardApi } from '../../ipc/tasks'
import { DatePicker } from '../DatePicker'
import ImageViewer from '../ImageViewer'
import { ConfirmDialog } from '../ConfirmDialog'
import Modal from '../Modal'
import TaskForm from '../TaskForm'
import { OcrProgress, OcrProgressBar } from './OcrStatus'
import { saveAndInsertImage } from './taskDetailImages'
import { TaskDescription } from './TaskImages'
import { SubtasksSection } from './SubtasksSection'
import { ActivityTimelineSection } from './ActivityTimelineSection'

interface TaskDetailProps {
  task: Task
  onDelete: (id: number) => void
  onUpdate: (task: Task) => void
  onNavigateToTask?: (taskId: number) => void
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

      <SubtasksSection
        subtasks={subtasks}
        counts={subtaskCounts}
        loading={subtaskLoading}
        hoveredSubtaskId={hoveredSubtaskId}
        onHoverSubtask={setHoveredSubtaskId}
        onToggleStatus={handleSubtaskStatusToggle}
        onOpenSubtask={handleSubtaskClick}
        onRequestDelete={setDeleteSubtaskId}
        onCreateSubtask={() => setShowNewSubtaskForm(true)}
      />

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

        <ActivityTimelineSection
          taskId={task.id}
          items={activityTimeline}
          loading={timelineLoading}
          hasMore={hasMoreTimeline}
          loadingMore={loadingMoreTimeline}
          editingHistoryId={editingHistoryId}
          editingHistoryContent={editingHistoryContent}
          onEditingHistoryContentChange={setEditingHistoryContent}
          onSaveEditHistory={handleSaveEditHistory}
          onCancelEditHistory={handleCancelEditHistory}
          onStartEditHistory={(item) => handleStartEditHistory(item as unknown as TaskHistory)}
          onDeleteHistory={handleDeleteHistory}
          onOpenSubtask={handleSubtaskClick}
          onLoadMore={() => loadActivityTimeline(activityTimeline.length, true)}
          onImageClick={setPreviewImage}
          formatDate={formatDate}
        />
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



export default TaskDetail
