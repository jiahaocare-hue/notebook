import React from 'react'
import type { ImageOCRInfo } from '../../types'

export interface OcrProgress {
  status: string
  progress: number
  message: string
}

export const OcrProgressBar = React.memo<{ progress: OcrProgress | null; showComplete: boolean }>(({ progress, showComplete }) => {
  if (!progress && !showComplete) return null

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-all duration-300 ${
      progress?.status === 'downloading' || progress?.status === 'recognizing'
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : showComplete
          ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    }`}>
      {progress?.status === 'downloading' || progress?.status === 'recognizing' ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span>{progress.message}</span>
          <span className="text-blue-500">({progress.progress}%)</span>
        </>
      ) : (
        <span>{progress?.message || '识别完成'}</span>
      )}
    </div>
  )
})

OcrProgressBar.displayName = 'OcrProgressBar'

export const OCRStatusBadge = React.memo<{ info?: ImageOCRInfo; compact?: boolean }>(({ info, compact = false }) => {
  const paddingClass = compact ? 'px-1 py-0.5' : 'px-1.5 py-0.5'
  const baseClass = `text-xs rounded ${paddingClass}`

  if (!info) {
    return <span className={`${baseClass} text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-700`}>待识别</span>
  }

  if (info.ocr_status === 'success') {
    return <span className={`${baseClass} text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30`}>识别成功</span>
  }

  if (info.ocr_status === 'failed') {
    return <span className={`${baseClass} text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30`}>识别失败</span>
  }

  return <span className={`${baseClass} text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30`}>识别中</span>
})

OCRStatusBadge.displayName = 'OCRStatusBadge'
