import React, { useState, useRef, useEffect } from 'react'
import { Task, TaskHistory } from '../../types'
import { imageApi, taskApi, clipboardApi, ocrApi } from '../../ipc/tasks'
import { DatePicker } from '../DatePicker'

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
        ? 'bg-blue-50 text-blue-700' 
        : showComplete
          ? 'bg-green-50 text-green-600'
          : 'bg-red-50 text-red-600'
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
}

const TaskDetail: React.FC<TaskDetailProps> = ({
  task,
  onDelete,
  onUpdate,
}) => {
  const [newContent, setNewContent] = useState('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null)
  const [showOcrComplete, setShowOcrComplete] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [history, setHistory] = useState<TaskHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const HISTORY_PAGE_SIZE = 20

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

  const loadHistory = async (offset: number = 0, append: boolean = false) => {
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
      console.error('Failed to load task history:', err)
      setHistoryError(err instanceof Error ? err.message : '加载历史记录失败')
    } finally {
      setHistoryLoading(false)
      setLoadingMore(false)
    }
  }

  const loadMoreHistory = () => {
    if (!loadingMore && hasMoreHistory) {
      loadHistory(history.length, true)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [task.id])

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
      high: 'text-red-600 bg-red-50',
      medium: 'text-yellow-600 bg-yellow-50',
      low: 'text-green-600 bg-green-50',
    }
    return colors[priority]
  }

  const getStatusColor = (status: Task['status']) => {
    const colors = {
      pending: 'text-gray-600 bg-gray-100',
      in_progress: 'text-blue-600 bg-blue-100',
      completed: 'text-green-600 bg-green-100',
      cancelled: 'text-red-600 bg-red-100',
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
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddContent()
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }

    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64 = event.target?.result as string
      if (!base64) return

      const savedPath = await imageApi.save(base64, file.name, task.id)
      if (savedPath) {
        const imageRef = `![${file.name}](local://${savedPath})`
        const updatedTask = { ...task, description: imageRef }
        onUpdate(updatedTask)
      }
    }
    reader.readAsDataURL(file)
    
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
          <h2 className="text-xl font-bold text-gray-900 mb-2">{task.title}</h2>
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
          <h3 className="text-sm font-medium text-gray-500 mb-1">优先级</h3>
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
          <h3 className="text-sm font-medium text-gray-500 mb-1">截止日期</h3>
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
          <h3 className="text-sm font-medium text-gray-500 mb-1">创建时间</h3>
          <p className="text-gray-700">{formatDate(task.created_at)}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">更新时间</h3>
          <p className="text-gray-700">{formatDate(task.updated_at)}</p>
        </div>
      </div>

      {task.description && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">描述</h3>
          <TaskDescription description={task.description} onImageClick={setPreviewImage} taskId={task.id} />
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-3">更新历史</h3>
        
        <div className="mb-3">
          <div className="flex gap-2">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="添加新的更新内容..."
              rows={3}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
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
              className="px-3 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
        </div>

        {historyLoading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-sm text-gray-500">加载历史记录...</span>
          </div>
        )}

        {historyError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span className="text-sm">{historyError}</span>
            <button
              onClick={() => loadHistory()}
              className="text-red-600 hover:text-red-700 text-sm font-medium"
            >
              重试
            </button>
          </div>
        )}

        {!historyLoading && !historyError && history.length > 0 && (
          <div className="space-y-2">
            {history.map((item) => {
              let changeText = ''
              let hasImages = false
              
              if (item.action === 'created') {
                try {
                  const newValue = item.new_value ? JSON.parse(item.new_value) : {}
                  const changes: string[] = ['创建了任务']
                  
                  if (newValue.description) {
                    const localImgPaths = newValue.description.match(/!\[.*?\]\(local:\/\/[^)]+\)/g) || []
                    const dataUrlImages = newValue.description.match(/!\[.*?\]\(data:image\/[^)]+\)/g) || []
                    if (localImgPaths.length + dataUrlImages.length > 0) {
                      hasImages = true
                    }
                    
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
                      const newLocalImgPaths = newValue.description.match(/!\[.*?\]\(local:\/\/[^)]+\)/g) || []
                      const newDataUrlImages = newValue.description.match(/!\[.*?\]\(data:image\/[^)]+\)/g) || []
                      
                      const totalImages = newLocalImgPaths.length + newDataUrlImages.length
                      if (totalImages > 0) {
                        hasImages = true
                      }
                      
                      const textContent = newValue.description.replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '').replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '').trim()
                      
                      if (textContent) {
                        changes.push(textContent)
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
              
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 text-sm py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-gray-700">{changeText}</p>
                    {hasImages && item.new_value && (
                      <HistoryImages newValue={item.new_value} onImageClick={setPreviewImage} taskId={task.id} />
                    )}
                    <p className="text-gray-400 text-xs mt-0.5">{formatDate(item.timestamp)}</p>
                  </div>
                </div>
              )
            })}
            {hasMoreHistory && (
              <button
                onClick={loadMoreHistory}
                disabled={loadingMore}
                className="w-full py-2 text-sm text-blue-500 hover:text-blue-600 disabled:text-gray-400 transition-colors"
              >
                {loadingMore ? '加载中...' : '加载更多'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={() => onDelete(task.id)}
          className="px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
        >
          删除
        </button>
      </div>

      {previewImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => {
            setPreviewImage(null)
            setCopyStatus('idle')
          }}
        >
          <img 
            src={previewImage} 
            alt="预览图片"
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />
          <button
            className="absolute top-4 left-4 text-white hover:text-gray-300 p-2"
            onClick={(e) => {
              e.stopPropagation()
              handleCopyImage()
            }}
            title="复制图片"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          {copyStatus !== 'idle' && (
            <div 
              className={`absolute top-4 left-16 px-3 py-1 rounded text-sm ${
                copyStatus === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}
            >
              {copyStatus === 'success' ? '复制成功' : '复制失败'}
            </div>
          )}
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => {
              setPreviewImage(null)
              setCopyStatus('idle')
            }}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

const TaskDescription: React.FC<{ description: string; onImageClick: (url: string) => void; taskId: number }> = ({ description, onImageClick, taskId }) => {
  const [images, setImages] = useState<{ path: string; dataUrl: string; error: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [ocrInfo, setOcrInfo] = useState<Map<string, ImageOCRInfo>>(new Map())
  const [retrying, setRetrying] = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

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
      return <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">待识别</span>
    }
    if (info.ocr_status === 'success') {
      return <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">识别成功</span>
    }
    if (info.ocr_status === 'failed') {
      return <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">识别失败</span>
    }
    return <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">识别中</span>
  }

  return (
    <div className="text-sm text-gray-700">
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
              <div key={idx} className="border border-gray-200 rounded-lg p-2">
                <div className="flex items-start gap-3">
                  {img.error ? (
                    <div className="w-16 h-16 bg-red-50 rounded flex items-center justify-center flex-shrink-0">
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
                        <span className="text-xs text-gray-400">
                          {new Date(info.ocr_timestamp).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                    {info && info.text_content && (
                      <p className="text-xs text-gray-600 line-clamp-2 mb-1" title={info.text_content}>
                        {info.text_content.substring(0, 100)}{info.text_content.length > 100 ? '...' : ''}
                      </p>
                    )}
                    {info && info.ocr_error && (
                      <p className="text-xs text-red-500 mb-1">{info.ocr_error}</p>
                    )}
                    <button
                      onClick={() => handleRetryOCR(img.path)}
                      disabled={retrying === img.path}
                      className="text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400"
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

const HistoryImages = React.memo<{ newValue: string; onImageClick: (url: string) => void; taskId: number }>(
  ({ newValue, onImageClick, taskId }) => {
    const [historyImages, setHistoryImages] = useState<{ path: string; dataUrl: string; error: boolean }[]>([])
    const [loading, setLoading] = useState(true)
    const [ocrInfo, setOcrInfo] = useState<Map<string, ImageOCRInfo>>(new Map())
    const [retrying, setRetrying] = useState<string | null>(null)
    const loadedRef = useRef(false)

    const getOCRStatusBadge = (info: ImageOCRInfo | undefined) => {
      if (!info) {
        return <span className="text-xs text-gray-400 bg-gray-100 px-1 rounded">待识别</span>
      }
      if (info.ocr_status === 'success') {
        return <span className="text-xs text-green-600 bg-green-50 px-1 rounded">成功</span>
      }
      if (info.ocr_status === 'failed') {
        return <span className="text-xs text-red-600 bg-red-50 px-1 rounded">失败</span>
      }
      return <span className="text-xs text-yellow-600 bg-yellow-50 px-1 rounded">中</span>
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
          const data = JSON.parse(newValue)
          if (data.description) {
            const loaded: { path: string; dataUrl: string; error: boolean }[] = []
            
            const localRegex = /!\[.*?\]\(local:\/\/([^)]+)\)/g
            let match
            const localPaths: string[] = []
            while ((match = localRegex.exec(data.description)) !== null) {
              localPaths.push(match[1])
            }
            
            const uniqueLocalPaths = [...new Set(localPaths)].slice(0, 3)
            for (const path of uniqueLocalPaths) {
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
            
            const dataUrlRegex = /!\[.*?\]\((data:image\/[^)]+)\)/g
            while ((match = dataUrlRegex.exec(data.description)) !== null) {
              if (loaded.length >= 3) break
              loaded.push({ path: match[1].substring(0, 50), dataUrl: match[1], error: false })
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
          }
        } catch (e) {
          console.error('Failed to load history images:', e)
        } finally {
          setLoading(false)
        }
      }
      loadHistoryImages()
    }, [newValue, taskId])

    if (loading) {
      return (
        <div className="flex gap-1 mt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div key={idx} className="border border-gray-200 rounded p-1.5">
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
                      className="text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400"
                    >
                      {retrying === img.path ? '识别中...' : '重新识别'}
                    </button>
                  </div>
                  {info && info.text_content && (
                    <p className="text-xs text-gray-500 line-clamp-1 mt-0.5" title={info.text_content}>
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
