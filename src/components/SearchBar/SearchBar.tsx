import React, { useState } from 'react'
import { SearchMode } from '../../types'
import { DateRangePicker } from '../DatePicker'

interface SearchBarProps {
  onSearch: (query: string, mode: SearchMode, dateRange?: { start: Date; end: Date }) => void
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('keyword')
  const [showDateRange, setShowDateRange] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const handleSearch = () => {
    if (!query.trim()) return
    
    const dateRange = showDateRange && startDate && endDate
      ? { start: new Date(startDate), end: new Date(endDate) }
      : undefined
    
    onSearch(query.trim(), mode, dateRange)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const modeOptions: { value: SearchMode; label: string; description: string }[] = [
    { value: 'keyword', label: '关键词', description: '精确匹配关键词' },
    { value: 'hybrid', label: '混合', description: '结合关键词和语义' },
  ]

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex gap-3 mb-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="搜索任务..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          搜索
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">搜索模式:</span>
          <div className="flex gap-1">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setMode(option.value)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  mode === option.value
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowDateRange(!showDateRange)}
          className={`flex items-center gap-1 px-3 py-1 text-sm rounded-lg transition-colors ${
            showDateRange
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          时间范围
        </button>
      </div>

      {showDateRange && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            startPlaceholder="开始日期"
            endPlaceholder="结束日期"
          />
        </div>
      )}
    </div>
  )
}

export default SearchBar
