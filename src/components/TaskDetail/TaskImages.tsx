import React, { useEffect, useRef, useState } from 'react'
import type { ImageOCRInfo } from '../../types'
import { imageApi, ocrApi } from '../../ipc/tasks'
import { OCRStatusBadge } from './OcrStatus'
import { retryOcrAndLoadInfo } from './taskDetailImages'

export const TaskDescription: React.FC<{ description: string; onImageClick: (url: string) => void; taskId: number }> = ({ description, onImageClick, taskId }) => {
  const [images, setImages] = useState<{ path: string; dataUrl: string; error: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [ocrInfo, setOcrInfo] = useState<Map<string, ImageOCRInfo>>(new Map())
  const [retrying, setRetrying] = useState<string | null>(null)
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const loadImages = async () => {
      try {
        setLoading(true)
        const loaded: { path: string; dataUrl: string; error: boolean }[] = []
        
        const localRegex = /!\[.*?\]\(local:\/\/([^)]+)\)/g
        let match
        const localPaths: string[] = []
        while ((match = localRegex.exec(description)) !== null) {
          localPaths.push(match[1])
        }
        
        for (const path of localPaths) {
          try {
            const dataUrl = await imageApi.load(path)
            if (dataUrl) {
              loaded.push({ path, dataUrl, error: false })
            } else {
              loaded.push({ path, dataUrl: '', error: true })
            }
          } catch {
            loaded.push({ path, dataUrl: '', error: true })
          }
        }
        
        setImages(loaded)
        
        if (taskId) {
          try {
            const ocrData = await ocrApi.getTaskImageInfo(taskId)
            const ocrMap = new Map<string, ImageOCRInfo>()
            ocrData.forEach(info => ocrMap.set(info.image_path, info))
            setOcrInfo(ocrMap)
          } catch (e) {
            console.error('Failed to load OCR info:', e)
          }
        }
      } catch (e) {
        console.error('Failed to load description images:', e)
      } finally {
        setLoading(false)
      }
    }
    loadImages()
  }, [description, taskId])

  const handleRetryOCR = async (imagePath: string) => {
    setRetrying(imagePath)
    setRetryErrors(prev => {
      const next = { ...prev }
      delete next[imagePath]
      return next
    })
    try {
      const result = await retryOcrAndLoadInfo(taskId, imagePath)
      setOcrInfo(result.ocrMap)
      if (result.error) {
        setRetryErrors(prev => ({
          ...prev,
          [imagePath]: result.error ?? 'OCR retry failed'
        }))
      }
    } catch (e) {
      console.error('Failed to retry OCR:', e)
      setRetryErrors(prev => ({
        ...prev,
        [imagePath]: e instanceof Error ? e.message : 'OCR retry failed'
      }))
    } finally {
      setRetrying(null)
    }
  }

  const textContent = description
    .replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '')
    .replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '')
    .trim()

  const getOCRStatusBadge = (info: ImageOCRInfo | undefined) => {
    if (!info) return <OCRStatusBadge info={info} />
    if (!info) {
      return <span className="text-xs text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-700 px-1.5 py-0.5 rounded">待识别</span>
    }
    if (info.ocr_status === 'success') {
      return <span className="text-xs text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30 px-1.5 py-0.5 rounded">识别成功</span>
    }
    if (info.ocr_status === 'failed') {
      return <span className="text-xs text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30 px-1.5 py-0.5 rounded">识别失败</span>
    }
    return <span className="text-xs text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded">识别中</span>
  }

  return (
    <div className="text-sm text-gray-700 dark:text-gray-300">
      {textContent && <p className="whitespace-pre-wrap">{textContent}</p>}
      {loading && images.length === 0 && description.includes('![') && (
        <div className="flex gap-1 mt-2">
          <div className="w-16 h-16 bg-gray-100 rounded animate-pulse"></div>
        </div>
      )}
      {images.length > 0 && (
        <div className="mt-2 space-y-2">
          {images.map((img, idx) => {
            const info = ocrInfo.get(img.path)
            const retryError = retryErrors[img.path]
            const isRetrying = retrying === img.path
            return (
              <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                <div className="flex items-start gap-3">
                  {img.error ? (
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded flex items-center justify-center flex-shrink-0">
                      <span className="text-red-400 text-xs">加载失败</span>
                    </div>
                  ) : (
                    <img
                      src={img.dataUrl}
                      alt={`图片 ${idx + 1}`}
                      className="w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onImageClick(img.dataUrl)
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getOCRStatusBadge(info)}
                      {info && info.ocr_timestamp && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(info.ocr_timestamp).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                    {info && info.text_content && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1" title={info.text_content}>
                        {info.text_content.substring(0, 100)}{info.text_content.length > 100 ? '...' : ''}
                      </p>
                    )}
                    {info && info.ocr_error && (
                      <p className="text-xs text-red-500 dark:text-red-400 mb-1">{info.ocr_error}</p>
                    )}
                    {retryError && (
                      <p className="text-xs text-red-500 dark:text-red-400 mb-1" role="alert">{retryError}</p>
                    )}
                    <button
                      onClick={() => handleRetryOCR(img.path)}
                      disabled={isRetrying}
                      aria-busy={isRetrying}
                      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400 dark:text-blue-400 dark:hover:text-blue-300 dark:disabled:text-gray-500"
                    >
                      {retrying === img.path ? '重新识别中...' : '重新识别'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const HistoryImages = React.memo<{ addedImages: string[]; onImageClick: (url: string) => void; taskId: number }>(
  ({ addedImages, onImageClick, taskId }) => {
    const [historyImages, setHistoryImages] = useState<{ path: string; dataUrl: string; error: boolean }[]>([])
    const [loading, setLoading] = useState(true)
    const [ocrInfo, setOcrInfo] = useState<Map<string, ImageOCRInfo>>(new Map())
    const [retrying, setRetrying] = useState<string | null>(null)
    const [retryErrors, setRetryErrors] = useState<Record<string, string>>({})
    const loadedRef = useRef(false)

    const getOCRStatusBadge = (info: ImageOCRInfo | undefined) => {
      if (!info) return <OCRStatusBadge info={info} compact />
      if (!info) {
        return <span className="text-xs text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-700 px-1 rounded">待识别</span>
      }
      if (info.ocr_status === 'success') {
        return <span className="text-xs text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30 px-1 rounded">成功</span>
      }
      if (info.ocr_status === 'failed') {
        return <span className="text-xs text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30 px-1 rounded">失败</span>
      }
      return <span className="text-xs text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30 px-1 rounded">中</span>
    }

    const handleRetryOCR = async (imagePath: string) => {
      setRetrying(imagePath)
      setRetryErrors(prev => {
        const next = { ...prev }
        delete next[imagePath]
        return next
      })
      try {
        const result = await retryOcrAndLoadInfo(taskId, imagePath)
        setOcrInfo(result.ocrMap)
        if (result.error) {
          setRetryErrors(prev => ({
            ...prev,
            [imagePath]: result.error ?? 'OCR retry failed'
          }))
        }
      } catch (e) {
        console.error('Failed to retry OCR:', e)
        setRetryErrors(prev => ({
          ...prev,
          [imagePath]: e instanceof Error ? e.message : 'OCR retry failed'
        }))
      } finally {
        setRetrying(null)
      }
    }

    useEffect(() => {
      if (loadedRef.current) return
      loadedRef.current = true
      
      const loadHistoryImages = async () => {
        try {
          setLoading(true)
          const loaded: { path: string; dataUrl: string; error: boolean }[] = []
          
          for (const imgRef of addedImages.slice(0, 3)) {
            const localMatch = imgRef.match(/!\[.*?\]\(local:\/\/([^)]+)\)/)
            if (localMatch) {
              const path = localMatch[1]
              try {
                const dataUrl = await imageApi.load(path)
                if (dataUrl) {
                  loaded.push({ path, dataUrl, error: false })
                } else {
                  loaded.push({ path, dataUrl: '', error: true })
                }
              } catch {
                loaded.push({ path, dataUrl: '', error: true })
              }
              continue
            }
            
            const dataUrlMatch = imgRef.match(/!\[.*?\]\((data:image\/[^)]+)\)/)
            if (dataUrlMatch) {
              loaded.push({ path: dataUrlMatch[1].substring(0, 50), dataUrl: dataUrlMatch[1], error: false })
            }
          }
          
          setHistoryImages(loaded)
          
          if (loaded.length > 0) {
            try {
              const ocrData = await ocrApi.getTaskImageInfo(taskId)
              const ocrMap = new Map<string, ImageOCRInfo>()
              ocrData.forEach(info => ocrMap.set(info.image_path, info))
              setOcrInfo(ocrMap)
            } catch (e) {
              console.error('Failed to load OCR info:', e)
            }
          }
        } catch (e) {
          console.error('Failed to load history images:', e)
        } finally {
          setLoading(false)
        }
      }
      loadHistoryImages()
    }, [addedImages, taskId])

    if (loading) {
      return (
        <div className="flex gap-1 mt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          ))}
        </div>
      )
    }

    if (historyImages.length === 0) return null

    return (
      <div className="mt-2 space-y-1">
        {historyImages.map((img, idx) => {
          const info = ocrInfo.get(img.path)
          const retryError = retryErrors[img.path]
          const isRetrying = retrying === img.path
          return (
            <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-1.5">
              <div className="flex items-center gap-2">
                {img.error ? (
                  <div className="w-10 h-10 bg-red-50 rounded flex items-center justify-center flex-shrink-0">
                    <span className="text-red-400 text-xs">失败</span>
                  </div>
                ) : (
                  <img
                    src={img.dataUrl}
                    alt={`历史图片 ${idx + 1}`}
                    className="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-80 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onImageClick(img.dataUrl)
                    }}
                    onError={() => {
                      setHistoryImages(prev => 
                        prev.map((item, i) => i === idx ? { ...item, error: true } : item)
                      )
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getOCRStatusBadge(info)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRetryOCR(img.path)
                      }}
                      disabled={isRetrying}
                      aria-busy={isRetrying}
                      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400 dark:text-blue-400 dark:hover:text-blue-300 dark:disabled:text-gray-500"
                    >
                      {retrying === img.path ? '识别中...' : '重新识别'}
                    </button>
                  </div>
                  {info && info.text_content && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5" title={info.text_content}>
                      {info.text_content.substring(0, 50)}{info.text_content.length > 50 ? '...' : ''}
                    </p>
                  )}
                  {retryError && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-0.5" role="alert">{retryError}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
)

