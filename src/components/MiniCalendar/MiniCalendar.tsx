import React, { useState, useMemo, useCallback } from 'react'
import { Task } from '../../types'

interface MiniCalendarProps {
  tasks: Task[]
  selectedDate: string | null
  onDateSelect: (date: string) => void
}

const statusColors: Record<string, string> = {
  pending: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-gray-400',
}

const MiniCalendar: React.FC<MiniCalendarProps> = ({ tasks, selectedDate, onDateSelect }) => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())

  const { daysInMonth, startingDay } = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1)
    const lastDay = new Date(currentYear, currentMonth + 1, 0)
    return {
      daysInMonth: lastDay.getDate(),
      startingDay: firstDay.getDay(),
    }
  }, [currentYear, currentMonth])

  const taskDateMap = useMemo(() => {
    const map = new Map<string, Task[]>()
    tasks.forEach(task => {
      if (task.due_date) {
        const dateKey = task.due_date.split('T')[0]
        const existing = map.get(dateKey) || []
        existing.push(task)
        map.set(dateKey, existing)
      }
    })
    return map
  }, [tasks])

  const formatDateLocal = useCallback((year: number, month: number, day: number): string => {
    const m = String(month + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  }, [])

  const getTasksForDay = useCallback((day: number): Task[] => {
    const dateStr = formatDateLocal(currentYear, currentMonth, day)
    return taskDateMap.get(dateStr) || []
  }, [currentYear, currentMonth, taskDateMap, formatDateLocal])

  const isToday = useCallback((day: number) => {
    const today = new Date()
    return day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
  }, [currentMonth, currentYear])

  const isSelected = useCallback((day: number) => {
    if (!selectedDate) return false
    const dateStr = formatDateLocal(currentYear, currentMonth, day)
    return dateStr === selectedDate
  }, [selectedDate, currentYear, currentMonth, formatDateLocal])

  const prevMonth = useCallback(() => {
    const newMonth = currentMonth === 0 ? 11 : currentMonth - 1
    const newYear = currentMonth === 0 ? currentYear - 1 : currentYear
    setCurrentYear(newYear)
    setCurrentMonth(newMonth)
  }, [currentYear, currentMonth])

  const nextMonth = useCallback(() => {
    const newMonth = currentMonth === 11 ? 0 : currentMonth + 1
    const newYear = currentMonth === 11 ? currentYear + 1 : currentYear
    setCurrentYear(newYear)
    setCurrentMonth(newMonth)
  }, [currentYear, currentMonth])

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-slate-200/60">
      <div className="flex items-center justify-between mb-2">
        <button 
          onClick={prevMonth} 
          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-slate-700">
          {currentYear}年{monthNames[currentMonth]}
        </span>
        <button 
          onClick={nextMonth} 
          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {weekDays.map((day, i) => (
          <div 
            key={day} 
            className={`text-center text-[10px] font-medium py-1 ${i === 0 || i === 6 ? 'text-red-400' : 'text-slate-400'}`}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: startingDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-6" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dayTasks = getTasksForDay(day)
          const today = isToday(day)
          const selected = isSelected(day)
          const dayOfWeek = new Date(currentYear, currentMonth, day).getDay()
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

          return (
            <button
              key={day}
              onClick={() => onDateSelect(formatDateLocal(currentYear, currentMonth, day))}
              className={`h-6 w-full flex flex-col items-center justify-center rounded text-[11px] font-medium transition-all ${
                selected
                  ? 'bg-blue-500 text-white'
                  : today
                  ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-300'
                  : isWeekend
                  ? 'text-red-400 hover:bg-slate-50'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {day}
              {dayTasks.length > 0 && !selected && (
                <div className="flex gap-0.5 mt-0.5">
                  {dayTasks.slice(0, 3).map(t => (
                    <span key={t.id} className={`w-1 h-1 rounded-full ${statusColors[t.status]}`} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default MiniCalendar
