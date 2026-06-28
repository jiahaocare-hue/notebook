import { Suspense, lazy, useState, useCallback, useEffect } from 'react'
import { MainLayout } from './components/Layout'
import { TodayTasks } from './pages/TodayTasks'
import { SettingsModal } from './components/Settings'
import { TaskProvider, useTaskContext } from './context/TaskContext'
import { StatusFilter, DateFilter } from './types'
import { taskApi } from './ipc/tasks'

const Search = lazy(() => import('./pages/Search').then(module => ({ default: module.Search })))
const CalendarPage = lazy(() => import('./pages/Calendar').then(module => ({ default: module.CalendarPage })))
const Summary = lazy(() => import('./pages/Summary').then(module => ({ default: module.Summary })))

type PageType = 'tasks' | 'search' | 'calendar' | 'summary'

function AppContent() {
  const [currentPage, setCurrentPage] = useState<PageType>('tasks')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  
  const { taskCounts, totalTaskCounts, refreshCounts } = useTaskContext()
  
  type ThemeMode = 'light' | 'dark' | 'system'

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('theme-mode')
      return (saved as ThemeMode) || 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    if (themeMode === 'dark') {
      applyTheme(true)
    } else if (themeMode === 'light') {
      applyTheme(false)
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches)
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [themeMode])

  const handleNavChange = (page: PageType) => {
    if (page !== currentPage) {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentPage(page)
        setIsTransitioning(false)
      }, 200)
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
      taskApi.getEarliestDate().then(earliestDate => {
        const today = new Date()
        const todayStr = today.toISOString().split('T')[0]
        refreshCounts({
          startDate: earliestDate,
          endDate: todayStr
        })
      }).catch(() => {
        refreshCounts({
          startDate: '2020-01-01',
          endDate: '2030-12-31'
        })
      })
    }
    
    if (currentPage !== 'tasks') {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentPage('tasks')
        setIsTransitioning(false)
      }, 200)
    }
  }

  const handleStatusFilterChange = (filter: StatusFilter) => {
    setStatusFilter(filter)
    if (currentPage === 'search') {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentPage('tasks')
        setIsTransitioning(false)
      }, 200)
    }
  }

  const handleSearch = useCallback(() => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentPage('search')
      setIsTransitioning(false)
    }, 200)
  }, [])

  const handleSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const handleThemeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode)
    try {
      localStorage.setItem('theme-mode', mode)
    } catch {
      // ignore
    }
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
        <div className={`transition-all duration-200 ease-out ${isTransitioning ? 'opacity-0 translate-y-2 scale-98' : 'opacity-100 translate-y-0 scale-100'}`}>
          <Suspense fallback={<div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading...</div>}>
            {renderPage()}
          </Suspense>
        </div>
      </MainLayout>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} themeMode={themeMode} onThemeChange={handleThemeChange} />
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
