import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { agentApi, chatApi } from '../../ipc/agent'
import { imageApi, taskApi } from '../../ipc/tasks'
import Modal from '../../components/Modal'
import TaskDetail from '../../components/TaskDetail'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { AgentImageAttachment, ChatMessage, ChatSession, MessageDisplayItem, ParsedToolCall, Task } from '../../types'

const quickPrompts = [
  '现在有多少个进行中的任务？',
  '我今天创建了哪些任务？',
  '帮我创建一个高优先级任务：准备季度报告，截止明天',
  '帮我创建这周的五个待办：健身、读书、写代码、复盘、购物',
]

const toolLabels: Record<string, string> = {
  create_task: '创建任务',
  batch_create_tasks: '批量创建',
  update_task: '更新任务',
  delete_task: '删除任务',
  get_task: '读取任务',
  list_subtasks: '查询子任务',
  query_tasks: '查询任务',
  search_tasks: '搜索任务',
  query_activity: '查询账本',
}

type RelatedPanelItem =
  | { kind: 'task'; id: string; task: Task; source: string }
  | { kind: 'activity'; id: string; eventType: string; taskId: number | null; title: string; time: string | null; source: string }

type PendingImageAttachment = {
  id: string
  name: string
  dataUrl: string
}

const Ask: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [displayItems, setDisplayItems] = useState<MessageDisplayItem[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null)
  const [pendingImages, setPendingImages] = useState<PendingImageAttachment[]>([])
  const requestIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const activeSession = useMemo(
    () => sessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  )

  const relatedItems = useMemo(() => extractRelatedItems(displayItems), [displayItems])

  const refreshSessions = useCallback(async () => {
    const nextSessions = await chatApi.listSessions()
    setSessions(nextSessions)
    return nextSessions
  }, [])

  const loadSession = useCallback(async (sessionId: string) => {
    const messages = await chatApi.loadSession(sessionId)
    setDisplayItems(displayItemsFromMessages(messages))
    setActiveSessionId(sessionId)
  }, [])

  const createSession = useCallback(async () => {
    const session = await chatApi.createSession('新对话')
    const nextSessions = await refreshSessions()
    setActiveSessionId(session.id)
    setDisplayItems([])
    if (!nextSessions.some(item => item.id === session.id)) {
      setSessions(prev => [session, ...prev])
    }
  }, [refreshSessions])

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const nextSessions = await refreshSessions()
        if (!mounted) {
          return
        }
        if (nextSessions.length > 0) {
          await loadSession(nextSessions[0].id)
        } else {
          const session = await chatApi.createSession('新对话')
          if (!mounted) {
            return
          }
          setSessions([session])
          setActiveSessionId(session.id)
          setDisplayItems([])
        }
      } finally {
        if (mounted) {
          setLoadingSessions(false)
        }
      }
    }

    void init()
    return () => {
      mounted = false
    }
  }, [loadSession, refreshSessions])

  useEffect(() => {
    const cleanups = [
      agentApi.onToken(({ requestId, delta }) => {
        if (requestId !== requestIdRef.current) {
          return
        }
        setDisplayItems(prev => appendAssistantToken(prev, requestId, delta))
      }),
      agentApi.onTool(({ requestId, toolName, args }) => {
        if (requestId !== requestIdRef.current) {
          return
        }
        setDisplayItems(prev => [
          ...prev,
          { kind: 'tool-bubble', id: `tool-${requestId}-${Date.now()}`, toolName, args, status: 'running' },
        ])
      }),
      agentApi.onResult(({ requestId, toolName, result }) => {
        if (requestId !== requestIdRef.current) {
          return
        }
        setDisplayItems(prev => markToolResult(prev, toolName, result))
      }),
      agentApi.onHITLRequired(({ requestId, toolName, args, toolCallId }) => {
        if (requestId !== requestIdRef.current) {
          return
        }
        setDisplayItems(prev => [
          ...prev,
          { kind: 'hitl-card', id: `hitl-${requestId}-${toolCallId}`, toolName, args, toolCallId, requestId },
        ])
      }),
      agentApi.onEnd(({ requestId }) => {
        if (requestId !== requestIdRef.current) {
          return
        }
        setIsStreaming(false)
        requestIdRef.current = null
        void refreshSessions()
      }),
      agentApi.onError(({ requestId, error }) => {
        if (requestId !== requestIdRef.current) {
          return
        }
        setDisplayItems(prev => [
          ...prev,
          { kind: 'assistant', id: `error-${requestId}`, content: error, error: true },
        ])
        setIsStreaming(false)
        requestIdRef.current = null
      }),
    ]

    return () => cleanups.forEach(cleanup => cleanup())
  }, [refreshSessions])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [displayItems])

  const addImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      return
    }

    const dataUrl = await readFileAsDataUrl(file)
    setPendingImages(prev => [
      ...prev,
      {
        id: createRequestId(),
        name: file.name || 'image.png',
        dataUrl,
      },
    ])
  }, [])

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    for (const file of files) {
      await addImageFile(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleInputPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      return
    }

    event.preventDefault()
    for (const file of imageFiles) {
      await addImageFile(file)
    }
  }

  const removePendingImage = (id: string) => {
    setPendingImages(prev => prev.filter(image => image.id !== id))
  }

  const sendMessage = async (override?: string) => {
    const message = (override ?? input).trim()
    const imagesToSend = override ? [] : pendingImages
    if ((!message && imagesToSend.length === 0) || isStreaming) {
      return
    }

    let sessionId = activeSessionId
    if (!sessionId) {
      const session = await chatApi.createSession('新对话')
      sessionId = session.id
      setSessions(prev => [session, ...prev])
      setActiveSessionId(sessionId)
    }

    const requestId = createRequestId()
    requestIdRef.current = requestId
    setIsStreaming(true)
    try {
      const attachments = await savePendingImages(imagesToSend)
      const finalMessage = message || 'Create a task with the attached image.'
      setInput('')
      setPendingImages([])
      setDisplayItems(prev => [
        ...prev,
        { kind: 'user', id: `user-${requestId}`, content: finalMessage, attachments },
      ])
      agentApi.chat({ sessionId, message: finalMessage, requestId, attachments })
    } catch (error) {
      console.error('Failed to send agent message:', error)
      setDisplayItems(prev => [
        ...prev,
        { kind: 'assistant', id: `error-${requestId}`, content: error instanceof Error ? error.message : 'Failed to save image attachments', error: true },
      ])
      requestIdRef.current = null
      setIsStreaming(false)
    }
  }

  const stopStreaming = () => {
    if (requestIdRef.current) {
      agentApi.stop(requestIdRef.current)
      requestIdRef.current = null
      setIsStreaming(false)
    }
  }

  const handleConfirm = (item: Extract<MessageDisplayItem, { kind: 'hitl-card' }>, confirmed: boolean) => {
    setDisplayItems(prev => prev.map(displayItem => (
      displayItem.kind === 'hitl-card' && displayItem.id === item.id
        ? { ...displayItem, decided: true }
        : displayItem
    )))
    agentApi.confirmHITL(item.requestId, confirmed)
  }

  const deleteSession = async (sessionId: string) => {
    if (isStreaming) {
      return
    }
    await chatApi.deleteSession(sessionId)
    const nextSessions = await refreshSessions()
    if (activeSessionId === sessionId) {
      if (nextSessions.length > 0) {
        await loadSession(nextSessions[0].id)
      } else {
        await createSession()
      }
    }
  }

  const openRelatedItem = async (item: RelatedPanelItem) => {
    const taskId = item.kind === 'task' ? item.task.id : item.taskId
    if (!taskId) {
      return
    }

    try {
      const task = item.kind === 'task' ? item.task : await taskApi.get(taskId)
      if (task) {
        setSelectedTask(task)
        setShowDetailModal(true)
      }
    } catch (error) {
      console.error('Failed to open related task:', error)
    }
  }

  const handleTaskUpdate = async (updatedTask: Task) => {
    try {
      await taskApi.update(updatedTask.id, {
        title: updatedTask.title,
        description: updatedTask.description ?? undefined,
        status: updatedTask.status,
        priority: updatedTask.priority,
        due_date: updatedTask.due_date ?? undefined,
        parent_id: updatedTask.parent_id,
        sort_order: updatedTask.sort_order,
      })
      const latestTask = await taskApi.get(updatedTask.id)
      if (latestTask) {
        setSelectedTask(latestTask)
      }
    } catch (error) {
      console.error('Failed to update related task:', error)
    }
  }

  const confirmDeleteTask = async () => {
    if (deleteTaskId === null) {
      return
    }

    try {
      await taskApi.delete(deleteTaskId)
      setShowDetailModal(false)
      setSelectedTask(null)
    } catch (error) {
      console.error('Failed to delete related task:', error)
    } finally {
      setDeleteTaskId(null)
    }
  }

  return (
    <>
    <div className="grid grid-cols-1 gap-4 xl:h-[calc(100vh-9rem)] xl:min-h-[620px] xl:grid-cols-[280px_minmax(0,1fr)_340px]">
      <aside className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg min-h-0 max-h-[22rem] xl:max-h-none flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">任务 Agent</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">可对话、可执行、可追溯</p>
          </div>
          <button
            onClick={createSession}
            className="w-9 h-9 rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors text-xl leading-none"
            title="新建对话"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingSessions ? (
            <div className="px-3 py-4 text-sm text-gray-400 dark:text-gray-500">加载中...</div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-400 dark:text-gray-500">暂无对话</div>
          ) : (
            sessions.map(session => (
              <div
                key={session.id}
                className={`group flex items-center gap-2 rounded-md px-3 py-2 transition-colors ${
                  session.id === activeSessionId
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50'
                }`}
              >
                <button
                  onClick={() => loadSession(session.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium">{session.title}</div>
                  <div className="text-[11px] opacity-60 mt-0.5">{formatDate(session.last_message_at)}</div>
                </button>
                <button
                  onClick={() => deleteSession(session.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                  title="删除对话"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg min-h-[520px] max-h-[calc(100vh-9rem)] xl:min-h-0 xl:max-h-none flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              {activeSession?.title ?? '新对话'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">工具调用会实时显示，删除任务需要确认。</p>
          </div>
          {isStreaming && (
            <button
              onClick={stopStreaming}
              className="px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              停止
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {displayItems.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-full max-w-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickPrompts.map(prompt => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="px-4 py-3 text-left rounded-md border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 hover:border-blue-200 dark:hover:border-blue-700 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            displayItems.map(item => (
              <DisplayItem
                key={item.id}
                item={item}
                onConfirm={handleConfirm}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-700">
          {pendingImages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {pendingImages.map(image => (
                <div key={image.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
                  <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePendingImage(image.id)}
                    disabled={isStreaming}
                    className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-black/60 text-xs leading-5 text-white hover:bg-black/75 disabled:opacity-50"
                    title="Remove image"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
            disabled={isStreaming}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              className="px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              title="Add image"
            >
              +
            </button>
            <textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              onPaste={handleInputPaste}
              onKeyDown={event => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder="输入任务指令或问题，Ctrl/⌘ + Enter 发送"
              rows={2}
              disabled={isStreaming}
              className="flex-1 resize-none px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
            />
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && pendingImages.length === 0) || isStreaming}
              className="px-5 py-3 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              发送
            </button>
          </div>
        </div>
      </section>

      <aside className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg min-h-[280px] max-h-[36rem] xl:min-h-0 xl:max-h-none flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">相关任务</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{relatedItems.length} 条工具结果</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {relatedItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 text-center px-6">
              查询、搜索或创建任务后，相关任务会显示在这里。
            </div>
          ) : (
            relatedItems.map(item => (
              <button
                key={item.id}
                onClick={() => openRelatedItem(item)}
                className="w-full text-left p-3 rounded-md border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                disabled={item.kind === 'activity' && !item.taskId}
              >
                {item.kind === 'task' ? (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-300">{item.source}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded ${getStatusPillClass(item.task.status)}`}>
                        {formatStatus(item.task.status)}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                      #{item.task.id} {item.task.title}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatPriority(item.task.priority)}</span>
                      {item.task.due_date && <span>截止 {item.task.due_date}</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-300">{formatEventType(item.eventType)}</span>
                      {item.time && <span className="text-[11px] text-gray-400 dark:text-gray-500">{item.time.slice(0, 10)}</span>}
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                      {item.taskId ? `#${item.taskId} ` : ''}{item.title}
                    </div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{item.source}</div>
                  </>
                )}
              </button>
            ))
          )}
        </div>
      </aside>
    </div>

    <Modal
      title="任务详情"
      isOpen={showDetailModal}
      onClose={() => {
        setShowDetailModal(false)
        setSelectedTask(null)
      }}
    >
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onDelete={(id) => setDeleteTaskId(id)}
          onUpdate={handleTaskUpdate}
        />
      )}
    </Modal>

    <ConfirmDialog
      isOpen={deleteTaskId !== null}
      title="删除任务"
      message="确定要删除这个任务吗？此操作无法撤销。"
      confirmText="删除"
      cancelText="取消"
      onConfirm={confirmDeleteTask}
      onCancel={() => setDeleteTaskId(null)}
      variant="danger"
    />
    </>
  )
}

function DisplayItem({
  item,
  onConfirm,
}: {
  item: MessageDisplayItem
  onConfirm: (item: Extract<MessageDisplayItem, { kind: 'hitl-card' }>, confirmed: boolean) => void
}) {
  if (item.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-lg px-4 py-3 bg-blue-500 text-white text-sm leading-6 whitespace-pre-wrap">
          {item.content}
          {item.attachments && item.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.attachments.map(attachment => (
                <img
                  key={attachment.path}
                  src={`app-image://local/${encodeURIComponent(attachment.path)}`}
                  alt={attachment.name}
                  className="h-20 w-20 rounded-md object-cover border border-white/30"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (item.kind === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className={`max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${
          item.error
            ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
            : 'bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
        }`}>
          {item.content}
        </div>
      </div>
    )
  }

  if (item.kind === 'tool-bubble') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[82%] rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {toolLabels[item.toolName] ?? item.toolName}
            </div>
            <span className={`text-xs ${
              item.status === 'done'
                ? 'text-emerald-600 dark:text-emerald-400'
                : item.status === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-blue-600 dark:text-blue-400'
            }`}>
              {item.status === 'done' ? '完成' : item.status === 'error' ? '失败' : '执行中'}
            </span>
          </div>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-gray-50 dark:bg-gray-800 p-3 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
            {JSON.stringify(item.result ?? item.args, null, 2)}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[82%] rounded-lg border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm">
        <div className="font-medium text-red-700 dark:text-red-300">
          确认{toolLabels[item.toolName] ?? item.toolName}
        </div>
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-white/70 dark:bg-gray-900 p-3 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {JSON.stringify(item.args, null, 2)}
        </pre>
        {item.decided ? (
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">已响应</div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onConfirm(item, true)}
              className="px-3 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
            >
              确认执行
            </button>
            <button
              onClick={() => onConfirm(item, false)}
              className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800"
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function extractRelatedItems(items: MessageDisplayItem[]): RelatedPanelItem[] {
  const related: RelatedPanelItem[] = []
  const seen = new Set<string>()

  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (item.kind !== 'tool-bubble' || !item.result) {
      continue
    }

    for (const nextItem of relatedItemsFromToolResult(item.toolName, item.result)) {
      if (seen.has(nextItem.id)) {
        continue
      }
      seen.add(nextItem.id)
      related.push(nextItem)
    }
  }

  return related.slice(0, 30)
}

function relatedItemsFromToolResult(toolName: string, result: unknown): RelatedPanelItem[] {
  const source = toolLabels[toolName] ?? toolName
  const data = getToolResultData(result)
  const related: RelatedPanelItem[] = []

  if (isTaskLike(data)) {
    related.push({ kind: 'task', id: `task-${data.id}`, task: data, source })
  }

  if (isRecord(data) && isTaskLike(data.task)) {
    related.push({ kind: 'task', id: `task-${data.task.id}`, task: data.task, source })
  }

  if (isRecord(data) && Array.isArray(data.tasks)) {
    for (const task of data.tasks) {
      if (isTaskLike(task)) {
        related.push({ kind: 'task', id: `task-${task.id}`, task, source })
      }
    }
  }

  if (isRecord(data) && Array.isArray(data.events)) {
    for (const event of data.events) {
      if (!isRecord(event)) {
        continue
      }
      const taskId = typeof event.task_id === 'number' ? event.task_id : null
      const eventType = typeof event.event_type === 'string' ? event.event_type : 'activity'
      const title = typeof event.task_title_snapshot === 'string' && event.task_title_snapshot
        ? event.task_title_snapshot
        : '任务活动'
      const time = typeof event.event_time === 'string' ? event.event_time : null
      const eventId = typeof event.id === 'string' ? event.id : `${eventType}-${taskId ?? 'none'}-${time ?? related.length}`

      related.push({
        kind: 'activity',
        id: `activity-${eventId}`,
        eventType,
        taskId,
        title,
        time,
        source,
      })
    }
  }

  return related
}

function getToolResultData(result: unknown): unknown {
  if (isRecord(result) && 'data' in result) {
    return result.data
  }
  return result
}

function isTaskLike(value: unknown): value is Task {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'number' &&
    typeof value.title === 'string' &&
    typeof value.status === 'string' &&
    typeof value.priority === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function displayItemsFromMessages(messages: ChatMessage[]): MessageDisplayItem[] {
  const toolResults = new Map<string, unknown>()
  for (const message of messages) {
    if (message.role === 'tool' && message.tool_call_id) {
      toolResults.set(message.tool_call_id, parseJson(message.content))
    }
  }

  const items: MessageDisplayItem[] = []
  for (const message of messages) {
    if (message.is_hidden) {
      continue
    }
    if (message.role === 'user') {
      const userDisplay = parseUserMessageForDisplay(message.content ?? '')
      items.push({ kind: 'user', id: message.id, content: userDisplay.content, attachments: userDisplay.attachments })
      continue
    }
    if (message.role === 'assistant') {
      if (message.content) {
        items.push({ kind: 'assistant', id: message.id, content: message.content })
      }
      for (const toolCall of parseToolCalls(message.tool_calls)) {
        const result = toolResults.get(toolCall.id)
        items.push({
          kind: 'tool-bubble',
          id: `${message.id}-${toolCall.id}`,
          toolName: toolCall.name,
          args: toolCall.args,
          result,
          status: result ? 'done' : 'running',
        })
      }
    }
  }
  return items
}

function parseUserMessageForDisplay(content: string): { content: string; attachments?: AgentImageAttachment[] } {
  const attachments = extractLocalImageAttachments(content)
  const cleanedContent = stripPersistedAttachmentNote(content).trim()

  return {
    content: cleanedContent || content,
    attachments: attachments.length > 0 ? attachments : undefined,
  }
}

function extractLocalImageAttachments(content: string): AgentImageAttachment[] {
  const attachments: AgentImageAttachment[] = []
  const seenPaths = new Set<string>()
  const imageRegex = /!\[([^\]]*)\]\(local:\/\/([^)]+)\)/g
  let match: RegExpExecArray | null

  while ((match = imageRegex.exec(content)) !== null) {
    const path = match[2]?.trim()
    if (!path || seenPaths.has(path)) {
      continue
    }
    seenPaths.add(path)
    attachments.push({
      kind: 'image',
      name: match[1]?.trim() || 'image',
      path,
    })
  }

  return attachments
}

function stripPersistedAttachmentNote(content: string): string {
  return content
    .replace(/\n*已附加图片:\n(?:!\[[^\]]*]\(local:\/\/[^)]+\)\n?)+\n如果本次请求创建或更新任务，请直接调用任务工具。系统支持把这些图片放入任务描述，工具会自动保留 local:\/\/ 图片引用。/g, '')
    .replace(/\n*Attached images:\n(?:!\[[^\]]*]\(local:\/\/[^)]+\)\n?)+\nWhen creating or updating a task from this request, keep these image references in the task description\.?/g, '')
}

function parseToolCalls(raw: string | null): ParsedToolCall[] {
  if (!raw) {
    return []
  }

  const parsed = parseJson(raw)
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed.map(item => {
    if (item && typeof item === 'object' && 'function' in item) {
      const record = item as { id?: string; function?: { name?: string; arguments?: string } }
      return {
        id: record.id ?? createRequestId(),
        name: record.function?.name ?? 'unknown_tool',
        args: parseJson(record.function?.arguments ?? '{}') as Record<string, unknown>,
      }
    }
    const record = item as { id?: string; name?: string; args?: Record<string, unknown> }
    return {
      id: record.id ?? createRequestId(),
      name: record.name ?? 'unknown_tool',
      args: record.args ?? {},
    }
  })
}

function parseJson(value: string | null): unknown {
  if (!value) {
    return null
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function appendAssistantToken(items: MessageDisplayItem[], requestId: string, delta: string): MessageDisplayItem[] {
  const streamingId = `assistant-${requestId}`
  const last = items[items.length - 1]
  if (last?.kind === 'assistant' && last.id === streamingId) {
    return items.map(item => (
      item.kind === 'assistant' && item.id === streamingId
        ? { ...item, content: item.content + delta }
        : item
    ))
  }
  return [...items, { kind: 'assistant', id: streamingId, content: delta }]
}

function markToolResult(items: MessageDisplayItem[], toolName: string, result: unknown): MessageDisplayItem[] {
  const next = [...items]
  for (let index = next.length - 1; index >= 0; index--) {
    const item = next[index]
    if (item.kind === 'tool-bubble' && item.toolName === toolName && item.status === 'running') {
      next[index] = { ...item, result, status: isToolResultError(result) ? 'error' : 'done' }
      return next
    }
  }
  next.push({
    kind: 'tool-bubble',
    id: `tool-result-${toolName}-${Date.now()}`,
    toolName,
    args: {},
    result,
    status: isToolResultError(result) ? 'error' : 'done',
  })
  return next
}

function isToolResultError(result: unknown): boolean {
  return Boolean(result && typeof result === 'object' && 'success' in result && (result as { success?: boolean }).success === false)
}

function createRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read image file'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

async function savePendingImages(images: PendingImageAttachment[]): Promise<AgentImageAttachment[]> {
  const attachments: AgentImageAttachment[] = []

  for (const image of images) {
    const savedPath = await imageApi.save(image.dataUrl, image.name)
    if (!savedPath) {
      throw new Error(`Failed to save image: ${image.name}`)
    }

    attachments.push({
      kind: 'image',
      name: image.name,
      path: savedPath,
    })
  }

  return attachments
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10)
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: '待处理',
    in_progress: '进行中',
    completed: '已完成',
    cancelled: '已取消',
  }
  return labels[status] ?? status
}

function formatPriority(priority: string): string {
  const labels: Record<string, string> = {
    high: '高优先级',
    medium: '中优先级',
    low: '低优先级',
  }
  return labels[priority] ?? priority
}

function formatEventType(eventType: string): string {
  const labels: Record<string, string> = {
    task_created: '创建任务',
    task_updated: '更新任务',
    task_status_changed: '状态变更',
    task_deleted: '删除任务',
  }
  return labels[eventType] ?? eventType
}

function getStatusPillClass(status: string): string {
  const classes: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    in_progress: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
    completed: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    cancelled: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
  }
  return classes[status] ?? classes.pending
}

export default Ask
