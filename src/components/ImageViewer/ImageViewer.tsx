import React, { useState, useRef, useEffect, useCallback } from 'react'

interface ImageViewerProps {
  src: string
  alt?: string
  onClose: () => void
  onCopy?: () => void
  copyStatus?: 'idle' | 'success' | 'error'
}

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const ZOOM_STEP = 0.2

const ImageViewer: React.FC<ImageViewerProps> = ({
  src,
  alt = '预览图片',
  onClose,
  onCopy,
  copyStatus = 'idle',
}) => {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [fitScale, setFitScale] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const updateFitScale = useCallback(() => {
    if (containerRef.current && imageRef.current) {
      const container = containerRef.current
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      
      const imgWidth = imageRef.current.naturalWidth
      const imgHeight = imageRef.current.naturalHeight
      
      if (imgWidth > 0 && imgHeight > 0) {
        const scaleX = containerWidth / imgWidth
        const scaleY = containerHeight / imgHeight
        const newFitScale = Math.min(scaleX, scaleY, 1)
        setFitScale(newFitScale)
        setScale(newFitScale)
      }
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      updateFitScale()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateFitScale])

  const handleImageLoad = () => {
    updateFitScale()
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta))
    
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left - rect.width / 2
      const mouseY = e.clientY - rect.top - rect.height / 2
      
      const scaleRatio = newScale / scale
      setPosition(prev => ({
        x: mouseX - (mouseX - prev.x) * scaleRatio,
        y: mouseY - (mouseY - prev.y) * scaleRatio,
      }))
    }
    
    setScale(newScale)
  }, [scale])

  const handleDoubleClick = useCallback(() => {
    if (scale === 1) {
      setScale(fitScale)
      setPosition({ x: 0, y: 0 })
    } else {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }, [scale, fitScale])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }, [position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleZoomIn = () => {
    const newScale = Math.min(MAX_SCALE, scale + ZOOM_STEP)
    setScale(newScale)
  }

  const handleZoomOut = () => {
    const newScale = Math.max(MIN_SCALE, scale - ZOOM_STEP)
    setScale(newScale)
  }

  const handleReset = () => {
    setScale(fitScale)
    setPosition({ x: 0, y: 0 })
  }

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      onClose()
    }
  }

  const scalePercentage = Math.round(scale * 100)

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 select-none"
      onClick={handleBackgroundClick}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="max-w-none transition-transform duration-75"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          cursor: isDragging ? 'grabbing' : scale > fitScale ? 'grab' : 'default',
        }}
        onLoad={handleImageLoad}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        draggable={false}
      />

      <div className="absolute top-4 left-4 flex items-center gap-2">
        {onCopy && (
          <button
            className="text-white hover:text-gray-300 p-2 bg-black/50 rounded-lg"
            onClick={(e) => {
              e.stopPropagation()
              onCopy()
            }}
            title="复制图片"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        )}
        {copyStatus !== 'idle' && (
          <div
            className={`px-3 py-1 rounded text-sm ${
              copyStatus === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {copyStatus === 'success' ? '复制成功' : '复制失败'}
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          className="text-white hover:text-gray-300 p-2 bg-black/50 rounded-lg"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-black/50 rounded-lg px-4 py-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleZoomOut()
          }}
          disabled={scale <= MIN_SCALE}
          className="text-white hover:text-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed p-1"
          title="缩小"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
        </button>

        <span className="text-white text-sm min-w-[60px] text-center">
          {scalePercentage}%
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation()
            handleZoomIn()
          }}
          disabled={scale >= MAX_SCALE}
          className="text-white hover:text-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed p-1"
          title="放大"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
          </svg>
        </button>

        <div className="w-px h-4 bg-gray-500" />

        <button
          onClick={(e) => {
            e.stopPropagation()
            handleReset()
          }}
          className="text-white hover:text-gray-300 p-1"
          title="重置"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="absolute bottom-4 right-4 text-gray-400 text-xs">
        滚轮缩放 · 双击切换 · 拖拽移动
      </div>
    </div>
  )
}

export default ImageViewer
