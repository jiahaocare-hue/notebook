import React, { useState, useEffect } from 'react'
import Modal from '../Modal'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [dataDir, setDataDir] = useState<string>('')
  const [customDataDir, setCustomDataDir] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadConfig()
    }
  }, [isOpen])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const config = await window.electronAPI.getConfig()
      setDataDir(config.dataDir)
      setCustomDataDir(config.customDataDir)
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBrowse = async () => {
    try {
      const result = await window.electronAPI.openDirectoryDialog()
      if (!result.canceled && result.filePath) {
        setCustomDataDir(result.filePath)
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error)
    }
  }

  const handleReset = () => {
    setCustomDataDir(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const result = await window.electronAPI.setDataDir(customDataDir)
      if (result.success) {
        setMessage({ type: 'success', text: '设置已保存，重启应用后生效' })
        setDataDir(customDataDir || dataDir)
      } else {
        setMessage({ type: 'error', text: result.error || '保存失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="设置" isOpen={isOpen} onClose={onClose}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              数据存储目录
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customDataDir || dataDir}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 text-sm"
              />
              <button
                onClick={handleBrowse}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
              >
                浏览...
              </button>
            </div>
            {customDataDir && (
              <button
                onClick={handleReset}
                className="mt-2 text-sm text-blue-500 hover:text-blue-600"
              >
                恢复默认目录
              </button>
            )}
            <p className="mt-2 text-xs text-gray-500">
              数据库和图片将存储在此目录中。修改后需要重启应用才能生效。
            </p>
          </div>

          {message && (
            <div
              className={`px-4 py-2 rounded-lg text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default SettingsModal
