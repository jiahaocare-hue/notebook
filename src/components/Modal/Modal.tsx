import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'

interface ModalProps {
  title: string
  children: React.ReactNode
  onClose: () => void
  isOpen: boolean
}

const Modal: React.FC<ModalProps> = ({ title, children, onClose, isOpen }) => {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setTimeout(() => contentRef.current?.scrollTo(0, 0), 0)
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800 tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-gray-200"
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
