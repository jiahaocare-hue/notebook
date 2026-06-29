import type { WebContents } from 'electron'
import { ChatStore, type ChatMessage } from './chatStore'
import { AgentToolsDispatcher, needsHITL, TOOL_DEFINITIONS, type AgentImageAttachment, type ToolCall } from './agentTools'
import { SystemPromptBuilder } from './systemPrompt'
import { streamChatCompletions } from './llmRequest'
import type { LLMConfig } from './config'
import { logger } from './logger'

type LlmMessage = {
  role: string
  content: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  name?: string
}

type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export class AgentService {
  private activeStreams = new Map<string, AbortController>()
  private hitlPending = new Map<string, (confirmed: boolean) => void>()

  constructor(
    private chatStore: ChatStore,
    private dispatcher: AgentToolsDispatcher,
    private systemPromptBuilder: SystemPromptBuilder,
    private getLlmConfig: () => LLMConfig | undefined,
    private maxIterations = 5
  ) {}

  abort(requestId: string): void {
    this.activeStreams.get(requestId)?.abort()
    this.activeStreams.delete(requestId)
    const pending = this.hitlPending.get(requestId)
    if (pending) {
      pending(false)
      this.hitlPending.delete(requestId)
    }
  }

  confirmHITL(requestId: string, confirmed: boolean): void {
    const pending = this.hitlPending.get(requestId)
    if (pending) {
      this.hitlPending.delete(requestId)
      pending(confirmed)
    }
  }

  async runChat(
    sessionId: string,
    requestId: string,
    userMessageContent: string,
    sender: WebContents,
    attachments: AgentImageAttachment[] = []
  ): Promise<void> {
    const controller = new AbortController()
    this.activeStreams.set(requestId, controller)

    try {
      this.chatStore.ensureSession(sessionId)
      const persistedUserContent = appendAttachmentNote(userMessageContent, attachments)
      this.chatStore.appendMessage({
        session_id: sessionId,
        role: 'user',
        content: persistedUserContent,
        is_hidden: 0,
      })

      const messagesForLLM = this.buildLLMMessages(
        this.systemPromptBuilder.build(),
        this.chatStore.getRecentMessagesForLLM(sessionId, 20)
      )

      let finalAnswerWritten = false

      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        if (controller.signal.aborted) {
          return
        }

        const llmConfig = this.getLlmConfig()
        if (!llmConfig?.apiKey || !llmConfig.baseUrl) {
          throw new Error('请先在设置里配置 LLM API Key 和 Base URL。')
        }

        const llmResult = await streamChatCompletions({
          apiKey: llmConfig.apiKey,
          baseUrl: llmConfig.baseUrl,
          model: llmConfig.model || undefined,
          timeout: llmConfig.timeout,
          verifySSL: llmConfig.verifySSL,
          messages: messagesForLLM,
          tools: TOOL_DEFINITIONS,
          signal: controller.signal,
          onToken: delta => {
            sender.send('agent:stream:token', { requestId, delta })
          },
        })

        if (controller.signal.aborted) {
          return
        }

        if (llmResult.toolCalls.length === 0) {
          this.chatStore.appendMessage({
            session_id: sessionId,
            role: 'assistant',
            content: llmResult.content || '',
            is_hidden: 0,
          })
          finalAnswerWritten = true
          break
        }

        const openAIToolCalls = llmResult.toolCalls.map(toOpenAIToolCall)
        const assistantMsg = this.chatStore.appendMessage({
          session_id: sessionId,
          role: 'assistant',
          content: llmResult.content || null,
          tool_calls: JSON.stringify(openAIToolCalls),
          is_hidden: 0,
        })

        messagesForLLM.push({
          role: 'assistant',
          content: llmResult.content || null,
          tool_calls: openAIToolCalls,
        })

        for (const toolCall of llmResult.toolCalls) {
          if (controller.signal.aborted) {
            return
          }

          const result = await this.executeToolWithHITL(toolCall, requestId, sessionId, assistantMsg.id, sender, attachments)
          const content = JSON.stringify(result)

          this.chatStore.appendMessage({
            session_id: sessionId,
            role: 'tool',
            content,
            tool_call_id: toolCall.id,
            tool_name: toolCall.name,
            is_hidden: 1,
          })

          messagesForLLM.push({
            role: 'tool',
            content,
            tool_call_id: toolCall.id,
            name: toolCall.name,
          })
        }
      }

      if (!finalAnswerWritten && !controller.signal.aborted) {
        const message = '已达到最大工具调用步数，我先停在这里。你可以换个更具体的指令继续。'
        sender.send('agent:stream:token', { requestId, delta: `\n${message}` })
        this.chatStore.appendMessage({
          session_id: sessionId,
          role: 'assistant',
          content: message,
          is_hidden: 0,
        })
      }

      sender.send('agent:stream:end', { requestId })
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : 'Agent 执行失败'
        logger.error('[AgentService] runChat failed:', error)
        sender.send('agent:stream:error', { requestId, error: message })
      }
    } finally {
      this.activeStreams.delete(requestId)
      this.hitlPending.delete(requestId)
    }
  }

  private async executeToolWithHITL(
    toolCall: ToolCall,
    requestId: string,
    sessionId: string,
    messageId: string,
    sender: WebContents,
    attachments: AgentImageAttachment[]
  ): Promise<unknown> {
    if (needsHITL(toolCall.name)) {
      sender.send('agent:stream:hitl-required', {
        requestId,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.args,
      })

      const confirmed = await new Promise<boolean>(resolve => {
        this.hitlPending.set(requestId, resolve)
      })

      if (!confirmed) {
        const result = { success: false, error: '用户取消了此操作' }
        sender.send('agent:stream:result', { requestId, toolName: toolCall.name, result })
        return result
      }
    }

    sender.send('agent:stream:tool', {
      requestId,
      toolName: toolCall.name,
      args: toolCall.args,
    })

    const result = await this.dispatcher.execute(toolCall, { sessionId, messageId, attachments })
    sender.send('agent:stream:result', {
      requestId,
      toolName: toolCall.name,
      result,
    })

    return result
  }

  private buildLLMMessages(systemPrompt: string, history: ChatMessage[]): LlmMessage[] {
    const messages: LlmMessage[] = [{ role: 'system', content: systemPrompt }]

    for (const message of history) {
      if (message.role === 'summary') {
        messages.push({ role: 'system', content: `历史摘要：${message.content ?? ''}` })
        continue
      }

      const llmMessage: LlmMessage = {
        role: message.role,
        content: message.content ?? null,
      }

      if (message.tool_calls) {
        llmMessage.tool_calls = JSON.parse(message.tool_calls) as OpenAIToolCall[]
      }
      if (message.tool_call_id) {
        llmMessage.tool_call_id = message.tool_call_id
      }
      if (message.tool_name) {
        llmMessage.name = message.tool_name
      }

      messages.push(llmMessage)
    }

    return messages
  }
}

function toOpenAIToolCall(toolCall: ToolCall): OpenAIToolCall {
  return {
    id: toolCall.id,
    type: 'function',
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.args),
    },
  }
}

function appendAttachmentNote(content: string, attachments: AgentImageAttachment[]): string {
  const imageRefs = attachments
    .filter(attachment => attachment.kind === 'image' && attachment.path)
    .map(attachment => `![${sanitizeImageAlt(attachment.name)}](local://${attachment.path})`)

  if (imageRefs.length === 0) {
    return content
  }

  const note = [
    '',
    '已附加图片:',
    ...imageRefs,
    '',
    '如果本次请求创建或更新任务，请直接调用任务工具。系统支持把这些图片放入任务描述，工具会自动保留 local:// 图片引用。',
  ].join('\n')

  return `${content.trim()}${note}`
}

function sanitizeImageAlt(name: string): string {
  return (name || 'image').replace(/[\r\n\]]/g, ' ').trim() || 'image'
}
