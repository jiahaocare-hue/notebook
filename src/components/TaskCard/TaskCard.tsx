import React, { useMemo } from 'react'
import { Task } from '../../types'

interface TaskCardProps {
  task: Task
  onClick: (task: Task) => void
}

const TaskCard: React.FC<TaskCardProps> = React.memo(({ task, onClick }) => {
  const getPriorityConfig = (priority: Task['priority']) => {
    const configs = {
      high: {
        label: '高优先级',
        bgColor: 'bg-red-50',
        textColor: 'text-red-600',
        borderColor: 'border-red-200',
        dotColor: 'bg-red-500',
      },
      medium: {
        label: '中优先级',
        bgColor: 'bg-amber-50',
        textColor: 'text-amber-600',
        borderColor: 'border-amber-200',
        dotColor: 'bg-amber-500',
      },
      low: {
        label: '低优先级',
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-600',
        borderColor: 'border-blue-200',
        dotColor: 'bg-blue-500',
      },
    }
    return configs[priority || 'medium']
  }

  const getStatusConfig = (status: Task['status']) => {
    const configs = {
      in_progress: {
        label: '进行中',
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-600',
        dotColor: 'bg-blue-500',
      },
      completed: {
        label: '已完成',
        bgColor: 'bg-green-50',
        textColor: 'text-green-600',
        dotColor: 'bg-green-500',
      },
      cancelled: {
        label: '已取消',
        bgColor: 'bg-red-50',
        textColor: 'text-red-600',
        dotColor: 'bg-red-500',
      },
      pending: {
        label: '待处理',
        bgColor: 'bg-yellow-50',
        textColor: 'text-yellow-600',
        dotColor: 'bg-yellow-500',
      },
    }
    return configs[status || 'pending']
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    })
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const displayDescription = useMemo(() => {
    if (!task.description) return ''
    const textOnly = task.description
      .replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '')
      .replace(/!\[.*?\]\(data:image[^)]+\)/g, '')
      .trim()
    return textOnly.length > 80 ? textOnly.substring(0, 80) + '...' : textOnly
  }, [task.description])

  const priorityConfig = getPriorityConfig(task.priority)
  const statusConfig = getStatusConfig(task.status)

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'

  return (
    <div
      onClick={() => onClick(task)}
      className="group bg-white rounded-xl shadow-sm border border-gray-100 p-5 cursor-pointer transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:border-gray-200"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
          {task.title}
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor} shrink-0`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor}`}></span>
          {statusConfig.label}
        </span>
      </div>

      {displayDescription && (
        <p className="text-gray-500 text-sm mb-4 line-clamp-2 leading-relaxed">{displayDescription}</p>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-50">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${priorityConfig.bgColor} ${priorityConfig.textColor} ${priorityConfig.borderColor}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig.dotColor}`}></span>
            {priorityConfig.label}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          {task.due_date && (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {formatDate(task.due_date)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {formatDateTime(task.updated_at)}
          </span>
        </div>
      </div>
    </div>
  )
})

TaskCard.displayName = 'TaskCard'

export default TaskCard
