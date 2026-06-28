import React from 'react'
import type { SubtaskCounts, Task } from '../../types'

interface SubtasksSectionProps {
  subtasks: Task[]
  counts: SubtaskCounts
  loading: boolean
  hoveredSubtaskId: number | null
  onHoverSubtask: (taskId: number | null) => void
  onToggleStatus: (subtask: Task) => void
  onOpenSubtask: (subtaskId: number) => void
  onRequestDelete: (subtaskId: number) => void
  onCreateSubtask: () => void
}

const statusLabel: Record<Task['status'], string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

const statusClass: Record<Task['status'], string> = {
  pending: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

export const SubtasksSection: React.FC<SubtasksSectionProps> = ({
  subtasks,
  counts,
  loading,
  hoveredSubtaskId,
  onHoverSubtask,
  onToggleStatus,
  onOpenSubtask,
  onRequestDelete,
  onCreateSubtask,
}) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          子任务 {counts.total > 0 && `(${counts.completed}/${counts.total})`}
        </h3>
      </div>

      {counts.total > 0 && (
        <div className="mb-3">
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${(counts.completed / counts.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
        </div>
      ) : subtasks.length > 0 ? (
        <div className="space-y-2 mb-3">
          {subtasks.map(subtask => (
            <div
              key={subtask.id}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group cursor-pointer"
              onMouseEnter={() => onHoverSubtask(subtask.id)}
              onMouseLeave={() => onHoverSubtask(null)}
            >
              <input
                type="checkbox"
                checked={subtask.status === 'completed'}
                onChange={(event) => {
                  event.stopPropagation()
                  onToggleStatus(subtask)
                }}
                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                onClick={(event) => event.stopPropagation()}
              />
              <div
                className="flex-1 min-w-0"
                onClick={() => onOpenSubtask(subtask.id)}
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
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusClass[subtask.status]}`}>
                {statusLabel[subtask.status]}
              </span>

              {hoveredSubtaskId === subtask.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleStatus(subtask)
                    }}
                    className="px-2 py-1 text-xs text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                  >
                    {subtask.status === 'completed' ? '重开' : '完成'}
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenSubtask(subtask.id)
                    }}
                    className="px-2 py-1 text-xs text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    编辑
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onRequestDelete(subtask.id)
                    }}
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
        onClick={onCreateSubtask}
        className="w-full py-2 text-sm text-blue-500 hover:text-blue-600 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
      >
        + 新建子任务
      </button>
    </div>
  )
}

