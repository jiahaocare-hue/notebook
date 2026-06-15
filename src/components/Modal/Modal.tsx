import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'

interface ModalProps {
  title: string
  children: React.ReactNode
  onClose: () => void
  isOpen: boolean
}

const Modal: React.FC<ModalProps> = ({ title, children, onClose, isOpen }) => {
  const contentRef = useRef<HTMLDivElement>(null)
  const [animating, setAnimating] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      document.body.style.overflow = 'hidden'
      // 延迟触发动画让 DOM 先渲染
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimating(true)
        })
      })
      setTimeout(() => contentRef.current?.scrollTo(0, 0), 0)
    } else {
      setAnimating(false)
      // 等待关闭动画完成后再隐藏
      const timer = setTimeout(() => {
        setVisible(false)
        document.body.style.overflow = 'unset'
      }, 150)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!visible) return null

  return ReactDOM.createPortal(
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-200 ease-out ${animating ? 'opacity-100' : 'opacity-0'}`}>
      <div className={`absolute inset-0 transition-opacity duration-200 ${animating ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-black/60" />
      </div>
      <div className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col transition-all duration-200 ${animating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700 rounded-full transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-gray-200"
            aria-label="关闭"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div ref={contentRef} className="px-6 py-5 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default Modal
