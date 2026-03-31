import React from 'react'
import { Task } from '../../types'

interface StatusBadgeProps {
  status: Task['status']
  size?: 'sm' | 'md'
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const statusConfig = {
    pending: {
      label: '待处理',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-300',
    },
    in_progress: {
      label: '进行中',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-800',
      borderColor: 'border-yellow-400',
    },
    completed: {
      label: '已完成',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      borderColor: 'border-green-400',
    },
    cancelled: {
      label: '已取消',
      bgColor: 'bg-red-100',
      textColor: 'text-red-800',
      borderColor: 'border-red-400',
    },
  }

  const config = statusConfig[status]
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.bgColor} ${config.textColor} ${config.borderColor} ${sizeClasses} font-medium`}
    >
      {config.label}
    </span>
  )
}

export default StatusBadge
