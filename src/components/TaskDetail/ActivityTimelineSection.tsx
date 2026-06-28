import React from 'react'
import type { ActivityTimelineItem } from '../../types'
import { HistoryImages } from './TaskImages'

interface ActivityTimelineSectionProps {
  taskId: number
  items: ActivityTimelineItem[]
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  editingHistoryId: number | null
  editingHistoryContent: string
  onEditingHistoryContentChange: (value: string) => void
  onSaveEditHistory: () => void
  onCancelEditHistory: () => void
  onStartEditHistory: (item: ActivityTimelineItem) => void
  onDeleteHistory: (historyId: number) => void
  onOpenSubtask: (taskId: number) => void
  onLoadMore: () => void
  onImageClick: (url: string) => void
  formatDate: (dateString: string) => string
}

const statusLabels: Record<string, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

const priorityLabels: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

function extractImages(description?: string): string[] {
  if (!description) {
    return []
  }

  const localImages = description.match(/!\[.*?\]\(local:\/\/[^)]+\)/g) || []
  const dataUrlImages = description.match(/!\[.*?\]\(data:image\/[^)]+\)/g) || []
  return [...localImages, ...dataUrlImages]
}

function stripImages(description?: string): string {
  return (description || '')
    .replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '')
    .replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '')
    .trim()
}

function parseJsonValue(value: string | null): Record<string, any> {
  if (!value) {
    return {}
  }

  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function describeTimelineItem(item: ActivityTimelineItem): { text: string; addedImages: string[] } {
  if (item.action === 'created') {
    const newValue = parseJsonValue(item.new_value)
    const changes = ['创建了任务']
    const addedImages = extractImages(newValue.description)
    const textContent = stripImages(newValue.description)

    if (textContent) {
      changes.push(textContent)
    }

    return { text: changes.join('，'), addedImages }
  }

  if (item.action === 'updated') {
    const oldValue = parseJsonValue(item.old_value)
    const newValue = parseJsonValue(item.new_value)
    const changes: string[] = []
    let addedImages: string[] = []

    if (oldValue.title !== newValue.title && newValue.title) {
      changes.push(`标题改为“${newValue.title}”`)
    }

    if (oldValue.description !== newValue.description) {
      if (newValue.description) {
        const oldImages = new Set(extractImages(oldValue.description))
        const allNewImages = extractImages(newValue.description)
        addedImages = allNewImages.filter(image => !oldImages.has(image))

        const oldTextContent = stripImages(oldValue.description)
        const newTextContent = stripImages(newValue.description)

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
      changes.push(`状态改为“${statusLabels[newValue.status] || newValue.status}”`)
    }

    if (oldValue.priority !== newValue.priority && newValue.priority) {
      changes.push(`优先级改为“${priorityLabels[newValue.priority] || newValue.priority}”`)
    }

    return {
      text: changes.length > 0 ? changes.join('，') : '更新了任务',
      addedImages,
    }
  }

  if (item.action === 'status_changed') {
    const newValue = parseJsonValue(item.new_value)
    const statusText = newValue.status ? statusLabels[newValue.status] || newValue.status : item.new_value || ''
    return { text: `状态改为“${statusText}”`, addedImages: [] }
  }

  if (item.action === 'priority_changed') {
    const newValue = parseJsonValue(item.new_value)
    const priorityText = newValue.priority ? priorityLabels[newValue.priority] || newValue.priority : item.new_value || ''
    return { text: `优先级改为“${priorityText}”`, addedImages: [] }
  }

  const actionLabels: Record<string, string> = {
    created: '创建任务',
    updated: '更新任务',
    status_changed: '状态变更',
    priority_changed: '优先级变更',
    deleted: '删除任务',
  }
  return { text: actionLabels[item.action] || item.action, addedImages: [] }
}

export const ActivityTimelineSection: React.FC<ActivityTimelineSectionProps> = ({
  taskId,
  items,
  loading,
  hasMore,
  loadingMore,
  editingHistoryId,
  editingHistoryContent,
  onEditingHistoryContentChange,
  onSaveEditHistory,
  onCancelEditHistory,
  onStartEditHistory,
  onDeleteHistory,
  onOpenSubtask,
  onLoadMore,
  onImageClick,
  formatDate,
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">加载活动时间线...</span>
      </div>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isParentTask = item.source_parent_id === null || item.source_task_id === taskId
        const isSubtaskCreated = item.action === 'created' && item.source_parent_id !== null && item.source_task_id !== taskId
        const description = describeTimelineItem(item)
        let changeText = description.text
        let borderColor = ''
        let icon = ''
        let sourcePrefix = ''

        if (!isParentTask) {
          if (isSubtaskCreated) {
            borderColor = 'border-l-2 border-l-green-400'
            icon = '->'
            sourcePrefix = `创建子任务“${item.source_task_title}”`
            changeText = ''
          } else if (item.action === 'status_changed') {
            borderColor = 'border-l-2 border-l-orange-400'
            icon = '*'
            sourcePrefix = `${item.source_task_title} ·`
          } else {
            borderColor = 'border-l-2 border-l-blue-400'
            icon = '-'
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
                <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
                  <textarea
                    value={editingHistoryContent}
                    onChange={(event) => onEditingHistoryContentChange(event.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        onSaveEditHistory()
                      }}
                      className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-xs"
                    >
                      保存
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        onCancelEditHistory()
                      }}
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
                      onClick={() => item.source_task_id !== taskId && onOpenSubtask(item.source_task_id)}
                    >
                      {icon} {sourcePrefix}{' '}
                    </span>
                  )}
                  {changeText && <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{changeText}</p>}
                  {description.addedImages.length > 0 && (
                    <HistoryImages addedImages={description.addedImages} onImageClick={onImageClick} taskId={taskId} />
                  )}
                </>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-gray-400 dark:text-gray-500 text-xs">{formatDate(item.timestamp)}</p>
                {editingHistoryId !== item.id && (
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={() => onStartEditHistory(item)}
                      className="text-gray-400 dark:text-gray-500 hover:text-blue-500 text-xs"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => onDeleteHistory(item.id)}
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
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full py-2 text-sm text-blue-500 hover:text-blue-600 disabled:text-gray-400 dark:disabled:text-gray-500 transition-colors"
        >
          {loadingMore ? '加载中...' : '加载更多'}
        </button>
      )}
    </div>
  )
}

