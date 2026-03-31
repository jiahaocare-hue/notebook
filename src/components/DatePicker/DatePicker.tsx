import React, { useState, useRef, useLayoutEffect, useMemo, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { formatDateLocal, formatDisplayDate, parseDateString, isSameDay } from '../../utils/dateUtils'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const DROPDOWN_HEIGHT = 380
const DROPDOWN_GAP = 8

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = '选择日期',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0, visible: false })

  const selectedDate = useMemo(() => parseDateString(value), [value])
  const today = useMemo(() => new Date(), [])

  const [viewYear, setViewYear] = useState(() => {
    const initial = selectedDate || today
    return initial.getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = selectedDate || today
    return initial.getMonth()
  })

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return { top: 0, left: 0, visible: false }

    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    const showAbove = spaceBelow < DROPDOWN_HEIGHT && spaceAbove > DROPDOWN_HEIGHT

    return {
      top: showAbove ? rect.top - DROPDOWN_HEIGHT - DROPDOWN_GAP : rect.bottom + DROPDOWN_GAP,
      left: rect.left,
      visible: true
    }
  }, [])

  useLayoutEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return
      }
      setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useLayoutEffect(() => {
    if (isOpen) {
      setPosition(calculatePosition())
    } else {
      setPosition(prev => ({ ...prev, visible: false }))
    }
  }, [isOpen, calculatePosition])

  const handlePrevMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 0) {
        setViewYear(y => y - 1)
        return 11
      }
      return prev - 1
    })
  }, [])

  const handleNextMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 11) {
        setViewYear(y => y + 1)
        return 0
      }
      return prev + 1
    })
  }, [])

  const handleDateSelect = useCallback((day: number) => {
    const newDate = new Date(viewYear, viewMonth, day)
    onChange(formatDateLocal(newDate))
    setIsOpen(false)
  }, [viewYear, viewMonth, onChange])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setIsOpen(false)
  }, [onChange])

  const handleToggle = useCallback(() => {
    if (!isOpen && selectedDate) {
      setViewYear(selectedDate.getFullYear())
      setViewMonth(selectedDate.getMonth())
    }
    setIsOpen(prev => !prev)
  }, [isOpen, selectedDate])

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay()
    const days: Array<{ type: 'empty' | 'day'; key: string; day?: number }> = []

    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push({ type: 'empty', key: `empty-${i}` })
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ type: 'day', key: `day-${day}`, day })
    }

    return days
  }, [viewYear, viewMonth])

  const displayValue = value ? formatDisplayDate(value) : placeholder

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className="fixed bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-[300px] z-[9999]"
      style={{
        top: position.top,
        left: position.left,
        visibility: position.visible ? 'visible' : 'hidden'
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <span className="text-lg font-semibold text-gray-800">
            {viewYear}年 {monthNames[viewMonth]}
          </span>
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day, index) => (
          <div
            key={day}
            className={`text-center text-xs font-medium py-2 ${
              index === 0 || index === 6 ? 'text-red-400' : 'text-gray-400'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((item) => {
          if (item.type === 'empty') {
            return <div key={item.key} className="h-10" />
          }

          const day = item.day!
          const currentDayDate = new Date(viewYear, viewMonth, day)
          const isSelected = isSameDay(selectedDate, currentDayDate)
          const isTodayDate = isSameDay(today, currentDayDate)
          const dayOfWeek = currentDayDate.getDay()
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleDateSelect(day)}
              className={`h-10 w-full flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-blue-500 text-white'
                  : isTodayDate
                  ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-300'
                  : isWeekend
                  ? 'text-red-400 hover:bg-gray-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={() => {
            setViewYear(today.getFullYear())
            setViewMonth(today.getMonth())
          }}
          className="text-sm text-blue-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
        >
          今天
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          清除
        </button>
      </div>
    </div>
  ) : null

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-left text-sm hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all flex items-center justify-between"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>{displayValue}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {ReactDOM.createPortal(dropdown, document.body)}
    </div>
  )
}

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  startPlaceholder?: string
  endPlaceholder?: string
  className?: string
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startPlaceholder = '开始日期',
  endPlaceholder = '结束日期',
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <DatePicker
        value={startDate}
        onChange={onStartDateChange}
        placeholder={startPlaceholder}
      />
      <span className="text-gray-400 text-sm">至</span>
      <DatePicker
        value={endDate}
        onChange={onEndDateChange}
        placeholder={endPlaceholder}
      />
    </div>
  )
}

export default DatePicker
