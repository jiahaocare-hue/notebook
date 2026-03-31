import React from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import { StatusFilter, DateFilter } from '../../types'

interface MainLayoutProps {
  children: React.ReactNode
  activeNav: 'tasks' | 'search' | 'calendar'
  onNavChange: (nav: 'tasks' | 'search' | 'calendar') => void
  statusFilter: StatusFilter
  onStatusFilterChange: (filter: StatusFilter) => void
  dateFilter: DateFilter
  onDateFilterChange: (filter: DateFilter) => void
  onSearch: () => void
  onSettings: () => void
  taskCounts: {
    all: number
    pending: number
    in_progress: number
    completed: number
    cancelled: number
  }
  totalTaskCounts: {
    all: number
    pending: number
    in_progress: number
    completed: number
    cancelled: number
  }
}

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  activeNav,
  onNavChange,
  statusFilter,
  onStatusFilterChange,
  dateFilter,
  onDateFilterChange,
  onSearch,
  onSettings,
  taskCounts,
  totalTaskCounts,
}) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header onSearch={onSearch} onSettings={onSettings} />
      <div className="flex flex-1">
        <Sidebar
          activeNav={activeNav}
          onNavChange={onNavChange}
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
          dateFilter={dateFilter}
          onDateFilterChange={onDateFilterChange}
          taskCounts={taskCounts}
          totalTaskCounts={totalTaskCounts}
        />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default MainLayout
