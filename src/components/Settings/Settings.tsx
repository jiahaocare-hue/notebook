import React, { useState, useEffect } from 'react'
import Modal from '../Modal'
import { appApi, ocrApi } from '../../ipc/tasks'

interface OCRLog {
  id: number
  task_id: number | null
  image_path: string | null
  status: string
  message: string | null
  error: string | null
  timestamp: string
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const DEFAULT_PROMPT_TEMPLATE = `你是一个任务管理助手，请根据以下任务数据生成一份结构清晰、内容详实的总结报告。

## 时间范围
{{timeRange}}

## 任务统计数据
- 总任务数: {{total}}
- 已完成: {{completed}}
- 进行中: {{inProgress}}
- 待处理: {{pending}}
- 已取消: {{cancelled}}
- 完成率: {{completionRate}}%
{{#avgCompletionTime}}- 平均完成时间: {{avgCompletionTime}} 天{{/avgCompletionTime}}

## 优先级分布
{{priorityDistribution}}

## 已完成任务详情
{{completedTasksList}}

## 进行中任务详情
{{inProgressTasksList}}

## 待处理任务详情
{{pendingTasksList}}

请严格按照以下格式生成总结报告：

### 一、已完成任务（共{{completed}}项）
请详细列出每项已完成任务：
- 任务名称
- 任务描述（如有）
- 完成时间
- 任务成果或关键产出

### 二、未完成任务
#### 1. 进行中任务（共{{inProgress}}项）
请详细列出每项进行中任务：
- 任务名称
- 任务描述（如有）
- 当前进度状态
- 截止日期（如有）
- 预计完成时间

#### 2. 待处理任务（共{{pending}}项）
请详细列出每项待处理任务：
- 任务名称
- 任务描述（如有）
- 优先级
- 截止日期（如有）

### 三、总结与建议
简要总结工作情况，给出改进建议和下一步计划。

报告应采用正式、专业的文档格式，内容准确、条理清晰，便于阅读和理解。请用中文回复。`

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [dataDir, setDataDir] = useState<string>('')
  const [customDataDir, setCustomDataDir] = useState<string | null>(null)
  const [llmApiKey, setLlmApiKey] = useState<string>('')
  const [llmBaseUrl, setLlmBaseUrl] = useState<string>('')
  const [llmModel, setLlmModel] = useState<string>('gpt-3.5-turbo')
  const [llmTimeout, setLlmTimeout] = useState<number>(30)
  const [llmVerifySSL, setLlmVerifySSL] = useState<boolean>(true)
  const [llmPromptTemplate, setLlmPromptTemplate] = useState<string>(DEFAULT_PROMPT_TEMPLATE)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [ocrLogs, setOcrLogs] = useState<OCRLog[]>([])
  const [ocrLogsLoading, setOcrLogsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadConfig()
      loadOCRLogs()
    }
  }, [isOpen])

  const loadOCRLogs = async () => {
    setOcrLogsLoading(true)
    try {
      const logs = await ocrApi.getLogs(20)
      setOcrLogs(logs)
    } catch (error) {
      console.error('Failed to load OCR logs:', error)
    } finally {
      setOcrLogsLoading(false)
    }
  }

  const loadConfig = async () => {
    setLoading(true)
    try {
      const config = await window.electronAPI.getConfig()
      setDataDir(config.dataDir)
      setCustomDataDir(config.customDataDir)
      const llmConfig = await window.electronAPI.getLlmConfig()
      setLlmApiKey(llmConfig.apiKey || '')
      setLlmBaseUrl(llmConfig.baseUrl || '')
      setLlmModel(llmConfig.model || 'gpt-3.5-turbo')
      setLlmTimeout(llmConfig.timeout || 30)
      setLlmVerifySSL(llmConfig.verifySSL !== false)
      setLlmPromptTemplate(llmConfig.promptTemplate || DEFAULT_PROMPT_TEMPLATE)
      const version = await appApi.getVersion()
      setAppVersion(version)
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

  const handleResetPromptTemplate = () => {
    setLlmPromptTemplate(DEFAULT_PROMPT_TEMPLATE)
  }

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    try {
      await appApi.checkForUpdates()
    } catch (error) {
      console.error('Failed to check for updates:', error)
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const result = await window.electronAPI.setDataDir(customDataDir)
      if (result.success) {
        await window.electronAPI.setLlmConfig({
          apiKey: llmApiKey || undefined,
          baseUrl: llmBaseUrl || undefined,
          model: llmModel || undefined,
          timeout: llmTimeout,
          verifySSL: llmVerifySSL,
          promptTemplate: llmPromptTemplate === DEFAULT_PROMPT_TEMPLATE ? undefined : llmPromptTemplate || undefined
        })
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
        <div className="space-y-6 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              关于
            </label>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-700">任务管理器</p>
                <p className="text-xs text-gray-500">版本 {appVersion}</p>
              </div>
              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkingUpdate ? '检查中...' : '检查更新'}
              </button>
            </div>
          </div>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              调试日志
            </label>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-600 flex-1">
                日志文件存储在用户数据目录中
              </p>
              <button
                onClick={async () => {
                  try {
                    await appApi.openLogFolder()
                  } catch (error) {
                    console.error('Failed to open log folder:', error)
                  }
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
              >
                打开日志文件夹
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              日志文件可用于调试问题。如果遇到问题，可以查看日志文件获取详细信息。
            </p>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              LLM 配置
            </label>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder="输入 API Key"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Base URL
                </label>
                <input
                  type="text"
                  value={llmBaseUrl}
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  placeholder="输入 Base URL（可选）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="gpt-3.5-turbo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  请求超时时间（秒）
                </label>
                <input
                  type="number"
                  value={llmTimeout}
                  onChange={(e) => setLlmTimeout(parseInt(e.target.value) || 30)}
                  min={1}
                  max={300}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="verifySSL"
                  checked={llmVerifySSL}
                  onChange={(e) => setLlmVerifySSL(e.target.checked)}
                  className="w-4 h-4 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="verifySSL" className="text-sm text-gray-700">
                  启用 SSL 证书验证
                </label>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs text-gray-500">
                    提示词模板
                  </label>
                  <button
                    onClick={handleResetPromptTemplate}
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    恢复默认模板
                  </button>
                </div>
                <textarea
                  value={llmPromptTemplate}
                  onChange={(e) => setLlmPromptTemplate(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="mt-1 text-xs text-gray-400">
                  可用变量: {`{{timeRange}}, {{total}}, {{completed}}, {{inProgress}}, {{pending}}, {{cancelled}}, {{completionRate}}, {{avgCompletionTime}}, {{priorityDistribution}}, {{monthlyDistribution}}, {{completedTasksList}}, {{inProgressTasksList}}, {{pendingTasksList}}`}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              配置 LLM 服务提供商的 API Key、Base URL、Model 和 HTTP 客户端选项。
            </p>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                OCR 执行日志
              </label>
              <button
                onClick={loadOCRLogs}
                disabled={ocrLogsLoading}
                className="text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400"
              >
                刷新
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto">
              {ocrLogsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                </div>
              ) : ocrLogs.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">暂无 OCR 日志</p>
              ) : (
                <div className="space-y-2">
                  {ocrLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-xs border-b border-gray-200 pb-2 last:border-0">
                      <span className={`px-1.5 py-0.5 rounded ${
                        log.status === 'success' 
                          ? 'bg-green-50 text-green-600' 
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {log.status === 'success' ? '成功' : '失败'}
                      </span>
                      <div className="flex-1 min-w-0">
                        {log.image_path && (
                          <p className="text-gray-600 truncate" title={log.image_path}>
                            图片: {log.image_path}
                          </p>
                        )}
                        {log.message && (
                          <p className="text-gray-500">{log.message}</p>
                        )}
                        {log.error && (
                          <p className="text-red-500">{log.error}</p>
                        )}
                        <p className="text-gray-400">
                          {new Date(log.timestamp).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              显示最近 20 条 OCR 执行记录。如果日志显示成功但搜索无结果，可能是图片中没有可识别的文字。
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
