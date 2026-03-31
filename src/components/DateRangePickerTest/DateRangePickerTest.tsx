import React, { useState } from 'react'
import { DateRangePicker } from '../DatePicker'

const DateRangePickerTest: React.FC = () => {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev])
  }

  const handleStartDateChange = (value: string) => {
    setStartDate(value)
    addLog(`开始日期已更新: ${value || '已清除'}`)
  }

  const handleEndDateChange = (value: string) => {
    setEndDate(value)
    addLog(`结束日期已更新: ${value || '已清除'}`)
  }

  const clearLogs = () => {
    setLogs([])
  }

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow-lg">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">DateRangePicker 组件测试</h1>
      
      <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">日期范围选择器</h2>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          startPlaceholder="选择开始日期"
          endPlaceholder="选择结束日期"
        />
      </div>

      <div className="mb-6 p-6 bg-gray-50 rounded-xl border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">当前选择状态</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <span className="text-sm text-gray-500 block mb-1">开始日期:</span>
            <span className={`text-lg font-medium ${startDate ? 'text-blue-600' : 'text-gray-400'}`}>
              {startDate || '未选择'}
            </span>
          </div>
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <span className="text-sm text-gray-500 block mb-1">结束日期:</span>
            <span className={`text-lg font-medium ${endDate ? 'text-blue-600' : 'text-gray-400'}`}>
              {endDate || '未选择'}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700">事件日志</h2>
          <button
            onClick={clearLogs}
            className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            清除日志
          </button>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-gray-400 text-center py-4">暂无日志，开始选择日期以查看事件</p>
          ) : (
            <ul className="space-y-2">
              {logs.map((log, index) => (
                <li key={index} className="text-sm text-gray-700 font-mono">
                  {log}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default DateRangePickerTest
