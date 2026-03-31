import React from 'react'

interface SkeletonProps {
  className?: string
  variant?: 'rect' | 'circle' | 'text'
  width?: string | number
  height?: string | number
}

const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect',
  width,
  height,
}) => {
  const baseClasses = 'animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]'
  
  const variantClasses = {
    rect: 'rounded-lg',
    circle: 'rounded-full',
    text: 'rounded h-4',
  }

  const style: React.CSSProperties = {
    width: width,
    height: height,
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  )
}

export const TaskCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton variant="text" className="w-3/4 h-5" />
        <Skeleton variant="rect" className="w-16 h-6 rounded-full" />
      </div>
      <Skeleton variant="text" className="w-full h-4" />
      <Skeleton variant="text" className="w-2/3 h-4" />
      <div className="flex items-center gap-3 pt-2">
        <Skeleton variant="rect" className="w-20 h-5 rounded-full" />
        <Skeleton variant="rect" className="w-24 h-4" />
      </div>
    </div>
  )
}

export const TaskListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <TaskCardSkeleton key={i} />
      ))}
    </div>
  )
}

export default Skeleton
