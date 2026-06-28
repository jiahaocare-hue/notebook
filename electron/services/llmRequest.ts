import { net, session, type Session } from 'electron'

export interface LlmPostJsonOptions {
  apiKey: string
  timeout: number
  verifySSL?: boolean
  body: Record<string, unknown>
}

export interface LlmPostJsonResponse<T> {
  statusCode: number
  bodyText: string
  data: T
}

export interface StreamChatCompletionsOptions {
  apiKey: string
  baseUrl: string
  model?: string
  timeout?: number
  verifySSL?: boolean
  messages: readonly unknown[]
  tools?: readonly unknown[]
  temperature?: number
  signal?: AbortSignal
  onToken?: (delta: string) => void
}

export interface StreamToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface StreamChatCompletionsResult {
  content: string
  toolCalls: StreamToolCall[]
}

export function normalizeChatCompletionsUrl(baseUrl: string): string {
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, '')
  if (/\/chat\/completions$/i.test(trimmedBaseUrl)) {
    return trimmedBaseUrl
  }

  return /\/v\d+$/i.test(trimmedBaseUrl)
    ? `${trimmedBaseUrl}/chat/completions`
    : `${trimmedBaseUrl}/v1/chat/completions`
}

let insecureLlmSession: Session | null = null

function getRequestSession(verifySSL?: boolean): Session | undefined {
  if (verifySSL !== false) {
    return undefined
  }

  if (!insecureLlmSession) {
    insecureLlmSession = session.fromPartition('llm-insecure-ssl-disabled')
    insecureLlmSession.setCertificateVerifyProc((_request, callback) => {
      callback(0)
    })
  }

  return insecureLlmSession
}

function formatNetworkError(error: unknown): string {
  if (!(error instanceof Error)) {
    return '未知网络错误'
  }

  const cause = (error as Error & { cause?: unknown }).cause
  const causeText = cause instanceof Error
    ? `${cause.name}: ${cause.message}`
    : cause
      ? String(cause)
      : ''

  return causeText ? `${error.message} (${causeText})` : error.message
}

export function createLlmNetworkError(error: unknown): Error {
  return new Error(`LLM API 网络请求失败: ${formatNetworkError(error)}。如果系统浏览器可以访问但应用不行，请检查代理是否对 Electron 应用生效。`)
}

export async function postJsonWithElectronNet<T>(
  url: string,
  options: LlmPostJsonOptions
): Promise<LlmPostJsonResponse<T>> {
  const { apiKey, body, timeout, verifySSL } = options

  return new Promise((resolve, reject) => {
    const requestSession = getRequestSession(verifySSL)
    const request = net.request({
      method: 'POST',
      url,
      session: requestSession,
    })

    let settled = false
    const timeoutId = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      request.abort()
      reject(new Error(`请求超时（${timeout} 秒）`))
    }, timeout * 1000)

    request.setHeader('Content-Type', 'application/json')
    request.setHeader('Authorization', `Bearer ${apiKey}`)

    request.on('response', response => {
      const chunks: Buffer[] = []

      response.on('data', chunk => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })

      response.on('end', () => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeoutId)

        const bodyText = Buffer.concat(chunks).toString('utf-8')
        let data: T
        try {
          data = JSON.parse(bodyText) as T
        } catch {
          reject(new Error(`LLM API 返回了非 JSON 内容: ${bodyText.slice(0, 300)}`))
          return
        }

        resolve({
          statusCode: response.statusCode,
          bodyText,
          data,
        })
      })
    })

    request.on('error', error => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutId)
      reject(createLlmNetworkError(error))
    })

    request.write(JSON.stringify(body))
    request.end()
  })
}

export function streamChatCompletions(options: StreamChatCompletionsOptions): Promise<StreamChatCompletionsResult> {
  const {
    apiKey,
    baseUrl,
    model = 'gpt-4o-mini',
    timeout = 30,
    verifySSL,
    messages,
    tools,
    temperature = 0.4,
    signal,
    onToken,
  } = options
  const url = normalizeChatCompletionsUrl(baseUrl)

  return new Promise((resolve, reject) => {
    const requestSession = getRequestSession(verifySSL)
    const request = net.request({
      method: 'POST',
      url,
      session: requestSession,
    })

    let settled = false
    let buffer = ''
    let content = ''
    let errorBody = ''
    const toolCalls = new Map<number, { id: string; name: string; argsString: string }>()

    const cleanup = () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', abortHandler)
    }

    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve({
        content,
        toolCalls: Array.from(toolCalls.values()).map(toolCall => ({
          id: toolCall.id,
          name: toolCall.name,
          args: parseToolArgs(toolCall.argsString),
        })),
      })
    }

    const fail = (error: unknown) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    const timeoutId = setTimeout(() => {
      request.abort()
      fail(new Error(`请求超时（${timeout} 秒）`))
    }, timeout * 1000)

    const abortHandler = () => {
      request.abort()
      fail(new Error('请求已取消'))
    }

    if (signal?.aborted) {
      abortHandler()
      return
    }
    signal?.addEventListener('abort', abortHandler)

    request.setHeader('Content-Type', 'application/json')
    request.setHeader('Authorization', `Bearer ${apiKey}`)

    request.on('response', response => {
      response.on('data', chunk => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : Buffer.from(chunk).toString('utf-8')

        if (response.statusCode < 200 || response.statusCode >= 300) {
          errorBody += text
          return
        }

        buffer += text
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          parseSseLine(line, toolCalls, delta => {
            content += delta
            onToken?.(delta)
          })
        }
      })

      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          fail(new Error(`LLM API 调用失败: ${response.statusCode} ${errorBody.slice(0, 500)}`))
          return
        }
        if (buffer.trim()) {
          parseSseLine(buffer, toolCalls, delta => {
            content += delta
            onToken?.(delta)
          })
        }
        finish()
      })
    })

    request.on('error', error => {
      if (signal?.aborted) {
        fail(new Error('请求已取消'))
        return
      }
      fail(createLlmNetworkError(error))
    })

    request.write(JSON.stringify({
      model,
      messages,
      tools,
      stream: true,
      temperature,
    }))
    request.end()
  })
}

function parseSseLine(
  line: string,
  toolCalls: Map<number, { id: string; name: string; argsString: string }>,
  onToken: (delta: string) => void
): void {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith('data:') || trimmed === 'data: [DONE]') {
    return
  }

  try {
    const data = JSON.parse(trimmed.slice(5).trim()) as {
      choices?: Array<{
        delta?: {
          content?: string
          tool_calls?: Array<{
            index: number
            id?: string
            function?: {
              name?: string
              arguments?: string
            }
          }>
        }
      }>
    }
    const delta = data.choices?.[0]?.delta
    if (!delta) {
      return
    }

    if (delta.content) {
      onToken(delta.content)
    }

    if (delta.tool_calls) {
      for (const chunk of delta.tool_calls) {
        const current = toolCalls.get(chunk.index) ?? { id: '', name: '', argsString: '' }
        if (chunk.id) {
          current.id += chunk.id
        }
        if (chunk.function?.name) {
          current.name += chunk.function.name
        }
        if (chunk.function?.arguments) {
          current.argsString += chunk.function.arguments
        }
        toolCalls.set(chunk.index, current)
      }
    }
  } catch {
    // Some OpenAI-compatible providers emit keep-alive lines or partial chunks.
  }
}

function parseToolArgs(argsString: string): Record<string, unknown> {
  if (!argsString.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(argsString)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
