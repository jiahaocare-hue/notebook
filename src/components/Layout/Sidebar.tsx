import React, { memo } from 'react'
import { StatusFilter, DateFilter } from '../../types'

interface SidebarProps {
  activeNav: 'tasks' | 'search' | 'calendar' | 'summary'
  onNavChange: (nav: 'tasks' | 'search' | 'calendar' | 'summary') => void
  statusFilter: StatusFilter
  onStatusFilterChange: (filter: StatusFilter) => void
  dateFilter: DateFilter
  onDateFilterChange: (filter: DateFilter) => void
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

const TasksIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
  </svg>
)

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const SummaryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

const statusColors = {
  all: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', activeBg: 'bg-slate-200' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', activeBg: 'bg-amber-100' },
  in_progress: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', activeBg: 'bg-blue-100' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', activeBg: 'bg-emerald-100' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', activeBg: 'bg-red-100' },
}

const Sidebar: React.FC<SidebarProps> = memo(({
  activeNav,
  onNavChange,
  statusFilter,
  onStatusFilterChange,
  dateFilter,
  onDateFilterChange,
  taskCounts,
  totalTaskCounts,
}) => {
  const navItems = [
    { id: 'tasks' as const, label: '任务列表', icon: TasksIcon },
    { id: 'calendar' as const, label: '日历', icon: CalendarIcon },
    { id: 'search' as const, label: '搜索', icon: SearchIcon },
    { id: 'summary' as const, label: '年度总结', icon: SummaryIcon },
  ]

  const dateItems: { id: DateFilter; label: string }[] = [
    { id: 'today', label: '今日' },
    { id: 'week', label: '本周' },
    { id: 'history', label: '历史' },
  ]

  const statusItems: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'pending', label: '待处理' },
    { id: 'in_progress', label: '进行中' },
    { id: 'completed', label: '已完成' },
    { id: 'cancelled', label: '已取消' },
  ]

  return (
    <aside className="w-72 bg-gradient-to-b from-slate-50 to-slate-100 h-full p-5 flex flex-col border-r border-slate-200/60 shadow-sm">
      <div className="mb-8 flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </span>
          任务管理
        </h1>
      </div>

      <nav className="space-y-1.5 mb-8 flex-shrink-0">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeNav === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ease-out group ${
                isActive
                  ? 'bg-white text-blue-600 shadow-md shadow-blue-500/10 border border-blue-100'
                  : 'text-slate-600 hover:bg-white/60 hover:shadow-sm hover:text-slate-800'
              }`}
            >
              <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                <Icon />
              </span>
              <span className="font-medium text-sm">{item.label}</span>
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
          )
        })}
      </nav>

      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/60 shadow-sm overflow-y-auto flex-1">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            时间范围
          </h3>
        </div>
        <div className="flex gap-1.5 mb-5">
          {dateItems.map((item) => {
            const isActive = dateFilter === item.id
            return (
              <button
                key={item.id}
                onClick={() => onDateFilterChange(item.id)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        <div className="border-t border-slate-200/60 pt-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            状态筛选
          </h3>
          <div className="flex flex-wrap gap-2">
            {statusItems.map((item) => {
              const colors = statusColors[item.id]
              const isActive = statusFilter === item.id
              const count = taskCounts[item.id]
              
              return (
                <button
                  key={item.id}
                  onClick={() => onStatusFilterChange(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105 ${
                    isActive
                      ? `${colors.activeBg} ${colors.text} shadow-sm ring-1 ring-current/20`
                      : `${colors.bg} ${colors.text} hover:shadow-sm`
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${colors.dot} ${isActive ? 'animate-pulse' : ''}`} />
                  <span>{item.label}</span>
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    isActive ? 'bg-white/50' : 'bg-white/70'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-6 flex-shrink-0">
        <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-xl p-4 border border-blue-200/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-slate-500">总任务数</p>
              <p className="text-lg font-bold text-slate-800">{totalTaskCounts.all}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
})

Sidebar.displayName = 'Sidebar'

export default Sidebar
