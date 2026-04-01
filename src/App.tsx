import { useState, useCallback } from 'react'
import { MainLayout } from './components/Layout'
import { TodayTasks } from './pages/TodayTasks'
import { Search } from './pages/Search'
import { CalendarPage } from './pages/Calendar'
import { Summary } from './pages/Summary'
import { SettingsModal } from './components/Settings'
import { TaskProvider, useTaskContext } from './context/TaskContext'
import { StatusFilter, DateFilter } from './types'

type PageType = 'tasks' | 'search' | 'calendar' | 'summary'

function AppContent() {
  const [currentPage, setCurrentPage] = useState<PageType>('tasks')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  
  const { taskCounts, totalTaskCounts, refreshCounts } = useTaskContext()

  const handleNavChange = (page: PageType) => {
    if (page !== currentPage) {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentPage(page)
        setIsTransitioning(false)
      }, 150)
    }
  }

  const handleDateFilterChange = (filter: DateFilter) => {
    if (filter === dateFilter) return // 避免重复点击同一个按钮
    
    setDateFilter(filter)
    
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    
    // 只刷新计数，任务列表由 TodayTasks 组件自己刷新
    if (filter === 'today') {
      refreshCounts({ date: todayStr })
    } else if (filter === 'week') {
      const startOfWeek = new Date(today)
      startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1))
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(startOfWeek.getDate() + 6)
      
      refreshCounts({ 
        startDate: startOfWeek.toISOString().split('T')[0], 
        endDate: endOfWeek.toISOString().split('T')[0] 
      })
    } else {
      refreshCounts({ 
        startDate: '2020-01-01', 
        endDate: '2030-12-31' 
      })
    }
    
    if (currentPage !== 'tasks') {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentPage('tasks')
        setIsTransitioning(false)
      }, 150)
    }
  }

  const handleStatusFilterChange = (filter: StatusFilter) => {
    setStatusFilter(filter)
    if (currentPage === 'search') {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentPage('tasks')
        setIsTransitioning(false)
      }, 150)
    }
  }

  const handleSearch = useCallback(() => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentPage('search')
      setIsTransitioning(false)
    }, 150)
  }, [])

  const handleSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const renderPage = () => {
    switch (currentPage) {
      case 'tasks':
        return (
          <TodayTasks 
            statusFilter={statusFilter}
            dateFilter={dateFilter}
          />
        )
      case 'calendar':
        return <CalendarPage />
      case 'search':
        return <Search />
      case 'summary':
        return <Summary />
      default:
        return null
    }
  }

  return (
    <>
      <MainLayout
        activeNav={currentPage}
        onNavChange={handleNavChange}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        dateFilter={dateFilter}
        onDateFilterChange={handleDateFilterChange}
        onSearch={handleSearch}
        onSettings={handleSettings}
        taskCounts={taskCounts}
        totalTaskCounts={totalTaskCounts}
      >
        <div className={`transition-all duration-150 ${isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
          {renderPage()}
        </div>
      </MainLayout>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

function App() {
  return (
    <TaskProvider>
      <AppContent />
    </TaskProvider>
  )
}

export default App
