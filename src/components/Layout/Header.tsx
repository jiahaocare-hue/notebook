import React, { memo } from 'react'

interface HeaderProps {
  onSearch: () => void
  onSettings: () => void
}

const Header: React.FC<HeaderProps> = memo(({ onSearch, onSettings }) => {
  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-8 py-5 flex items-center justify-between shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-800 flex items-center gap-3">
        <svg
          className="w-8 h-8 text-indigo-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
        <span className="tracking-tight">任务管理器</span>
      </h1>
      <div className="flex items-center gap-3">
        <button
          onClick={onSearch}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 hover:text-gray-800 hover:scale-105 active:scale-95 transition-all duration-200 ease-out"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="font-medium">搜索</span>
        </button>
        <button
          onClick={onSettings}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 hover:text-gray-800 hover:scale-105 active:scale-95 transition-all duration-200 ease-out"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="font-medium">设置</span>
        </button>
      </div>
    </header>
  )
})

Header.displayName = 'Header'

export default Header
