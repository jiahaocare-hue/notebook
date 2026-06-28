import type Database from 'better-sqlite3'
import type { TaskAskEvidence, TaskAskRequest, TaskAskScope, TaskAskSource } from '../../src/types'
import { normalizeChatCompletionsUrl, postJsonWithElectronNet } from './llmRequest'
import { buildDateRangeCondition } from './query'

export interface AskLLMConfig {
  apiKey: string
  baseUrl: string
  model?: string
  timeout?: number
  verifySSL?: boolean
}

type TaskEvidenceRow = {
  id: number
  title: string
  description: string | null
  created_at: string
  updated_at: string
}

type HistoryEvidenceRow = {
  id: number
  task_id: number
  task_title: string
  action: string
  old_value: string | null
  new_value: string | null
  timestamp: string
}

type OcrEvidenceRow = {
  id: number
  task_id: number
  task_title: string
  image_path: string
  text_content: string | null
  ocr_timestamp: string | null
  created_at: string
}

const DEFAULT_SOURCES: TaskAskSource[] = ['tasks', 'history', 'ocr']
const SOURCE_LABELS: Record<TaskAskSource, string> = {
  tasks: '任务',
  history: '历史记录',
  ocr: '图片 OCR',
}

type AskIntent = 'created_tasks' | 'general'

function detectAskIntent(question: string): AskIntent {
  if (/(创建|新建|新增|建了|created)/i.test(question) && /(任务|事项|事情|什么)/.test(question)) {
    return 'created_tasks'
  }

  return 'general'
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function inferScopeFromQuestion(question: string, scope?: TaskAskScope): TaskAskScope | undefined {
  if (scope?.startDate || scope?.endDate) {
    return scope
  }

  const today = new Date()
  if (/今天|今日/.test(question)) {
    return {
      ...scope,
      startDate: formatLocalDate(today),
      endDate: formatLocalDate(today),
    }
  }

  if (/本周|这周|這周|最近一周/.test(question)) {
    const dayOfWeek = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    return {
      ...scope,
      startDate: formatLocalDate(monday),
      endDate: formatLocalDate(today),
    }
  }

  if (/本月|这个月|這個月|最近一个月/.test(question)) {
    return {
      ...scope,
      startDate: formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      endDate: formatLocalDate(today),
    }
  }

  return scope
}

function getSources(scope?: TaskAskScope): Set<TaskAskSource> {
  const sources = scope?.sources?.length ? scope.sources : DEFAULT_SOURCES
  return new Set(sources)
}

function buildQueryTerms(question: string): string[] {
  const normalized = question.trim().replace(/\s+/g, ' ')
  const terms = new Set<string>()

  if (normalized) {
    terms.add(normalized)
  }

  for (const match of normalized.matchAll(/[A-Za-z0-9_#+.-]{2,}/g)) {
    terms.add(match[0])
  }

  for (const match of normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const run = match[0]
    if (run.length <= 12) {
      terms.add(run)
    }
    for (let index = 0; index < run.length - 1; index++) {
      terms.add(run.slice(index, index + 2))
    }
  }

  return Array.from(terms)
    .map(term => term.trim())
    .filter(term => term.length >= 2)
    .slice(0, 16)
}

function appendTextMatch(
  clauses: string[],
  params: (string | number)[],
  columns: string[],
  terms: string[]
): void {
  const termClauses: string[] = []

  for (const term of terms) {
    const columnClauses = columns.map(column => `${column} LIKE ?`)
    termClauses.push(`(${columnClauses.join(' OR ')})`)
    for (let index = 0; index < columns.length; index++) {
      params.push(`%${term}%`)
    }
  }

  if (termClauses.length > 0) {
    clauses.push(`(${termClauses.join(' OR ')})`)
  }
}

function appendScopeFilters(
  clauses: string[],
  params: (string | number)[],
  dateColumn: string,
  scope?: TaskAskScope,
  statusColumn = 't.status'
): void {
  if (scope?.status && scope.status !== 'all') {
    clauses.push(`${statusColumn} = ?`)
    params.push(scope.status)
  }

  const dateFilter = buildDateRangeCondition(dateColumn, scope?.startDate, scope?.endDate)
  if (dateFilter) {
    clauses.push(`(${dateFilter.sql})`)
    params.push(...dateFilter.params)
  }
}

function stripImageMarks(text: string): string {
  return text
    .replace(/!\[.*?\]\(local:\/\/[^)]+\)/g, '')
    .replace(/!\[.*?\]\(app-image:\/\/[^)]+\)/g, '')
    .replace(/!\[.*?\]\(data:image[^)]+\)/g, '')
}

function valueToText(value: string | null): string {
  if (!value) {
    return ''
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return Object.entries(parsed)
      .map(([key, item]) => `${key}: ${typeof item === 'string' ? item : JSON.stringify(item)}`)
      .join('\n')
  } catch {
    return value
  }
}

function compactText(text: string, maxLength = 1200): string {
  const compacted = stripImageMarks(text).replace(/\s+/g, ' ').trim()
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength)}...` : compacted
}

function countOccurrences(text: string, term: string): number {
  if (!term) {
    return 0
  }
  const lowerText = text.toLowerCase()
  const lowerTerm = term.toLowerCase()
  let count = 0
  let index = lowerText.indexOf(lowerTerm)

  while (index !== -1) {
    count++
    index = lowerText.indexOf(lowerTerm, index + lowerTerm.length)
  }

  return count
}

function scoreText(text: string, terms: string[], title = ''): number {
  let score = 0
  for (const term of terms) {
    score += countOccurrences(text, term)
    score += countOccurrences(title, term) * 2
  }
  return score
}

function buildSnippet(text: string, terms: string[], maxLength = 220): string {
  const compacted = compactText(text, 2000)
  if (compacted.length <= maxLength) {
    return compacted
  }

  const lower = compacted.toLowerCase()
  const firstHit = terms
    .map(term => lower.indexOf(term.toLowerCase()))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]

  if (firstHit === undefined) {
    return `${compacted.slice(0, maxLength)}...`
  }

  const start = Math.max(0, firstHit - 60)
  const end = Math.min(compacted.length, start + maxLength)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < compacted.length ? '...' : ''
  return `${prefix}${compacted.slice(start, end)}${suffix}`
}

function queryTaskEvidence(db: Database.Database, terms: string[], scope?: TaskAskScope): TaskAskEvidence[] {
  const clauses: string[] = []
  const params: (string | number)[] = []

  appendTextMatch(clauses, params, ['t.title', 'COALESCE(t.description, \'\')'], terms)
  appendScopeFilters(clauses, params, 't.created_at', scope)

  const rows = db.prepare(`
    SELECT t.id, t.title, t.description, t.created_at, t.updated_at
    FROM tasks t
    WHERE ${clauses.join(' AND ')}
    ORDER BY t.updated_at DESC
    LIMIT 20
  `).all(...params) as TaskEvidenceRow[]

  return rows.map(row => {
    const matchedText = compactText(`${row.title}\n${row.description || ''}`)
    const score = scoreText(matchedText, terms, row.title)
    return {
      id: `tasks-${row.id}`,
      source: 'tasks',
      taskId: row.id,
      taskTitle: row.title,
      matchedText,
      snippet: buildSnippet(matchedText, terms),
      timestamp: row.updated_at || row.created_at,
      score,
    }
  })
}

function queryHistoryEvidence(db: Database.Database, terms: string[], scope?: TaskAskScope): TaskAskEvidence[] {
  const clauses: string[] = []
  const params: (string | number)[] = []

  appendTextMatch(clauses, params, ['COALESCE(h.old_value, \'\')', 'COALESCE(h.new_value, \'\')'], terms)
  appendScopeFilters(clauses, params, 'h.timestamp', scope)

  const rows = db.prepare(`
    SELECT h.id, h.task_id, h.action, h.old_value, h.new_value, h.timestamp, t.title as task_title
    FROM task_history h
    INNER JOIN tasks t ON t.id = h.task_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY h.timestamp DESC
    LIMIT 24
  `).all(...params) as HistoryEvidenceRow[]

  return rows.map(row => {
    const oldText = valueToText(row.old_value)
    const newText = valueToText(row.new_value)
    const matchedText = compactText(`动作: ${row.action}\n旧值: ${oldText}\n新值: ${newText}`)
    const score = scoreText(matchedText, terms, row.task_title) + 1
    return {
      id: `history-${row.id}`,
      source: 'history',
      taskId: row.task_id,
      taskTitle: row.task_title,
      matchedText,
      snippet: buildSnippet(matchedText, terms),
      timestamp: row.timestamp,
      score,
    }
  })
}

function queryOcrEvidence(db: Database.Database, terms: string[], scope?: TaskAskScope): TaskAskEvidence[] {
  const clauses: string[] = ['it.task_id IS NOT NULL']
  const params: (string | number)[] = []

  appendTextMatch(clauses, params, ['COALESCE(it.text_content, \'\')'], terms)
  appendScopeFilters(clauses, params, 'COALESCE(it.ocr_timestamp, it.created_at)', scope)

  const rows = db.prepare(`
    SELECT it.id, it.task_id, it.image_path, it.text_content, it.ocr_timestamp, it.created_at, t.title as task_title
    FROM image_texts it
    INNER JOIN tasks t ON t.id = it.task_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY COALESCE(it.ocr_timestamp, it.created_at) DESC
    LIMIT 20
  `).all(...params) as OcrEvidenceRow[]

  return rows.map(row => {
    const matchedText = compactText(row.text_content || '')
    const score = scoreText(matchedText, terms, row.task_title) + 1
    return {
      id: `ocr-${row.id}`,
      source: 'ocr',
      taskId: row.task_id,
      taskTitle: row.task_title,
      matchedText,
      snippet: buildSnippet(matchedText, terms),
      timestamp: row.ocr_timestamp || row.created_at,
      imagePath: row.image_path,
      score,
    }
  })
}

function queryRecentTaskEvidence(db: Database.Database, scope?: TaskAskScope): TaskAskEvidence[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  appendScopeFilters(clauses, params, 't.updated_at', scope)

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db.prepare(`
    SELECT t.id, t.title, t.description, t.created_at, t.updated_at
    FROM tasks t
    ${whereSql}
    ORDER BY t.updated_at DESC
    LIMIT 10
  `).all(...params) as TaskEvidenceRow[]

  return rows.map((row, index) => {
    const matchedText = compactText(`${row.title}\n${row.description || ''}`)
    return {
      id: `recent-task-${row.id}`,
      source: 'tasks',
      taskId: row.id,
      taskTitle: row.title,
      matchedText,
      snippet: buildSnippet(matchedText, []),
      timestamp: row.updated_at || row.created_at,
      score: 0.5 - index * 0.01,
    }
  })
}

function queryRecentHistoryEvidence(db: Database.Database, scope?: TaskAskScope, actions?: string[]): TaskAskEvidence[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  appendScopeFilters(clauses, params, 'h.timestamp', scope)
  if (actions?.length) {
    clauses.push(`h.action IN (${actions.map(() => '?').join(',')})`)
    params.push(...actions)
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db.prepare(`
    SELECT h.id, h.task_id, h.action, h.old_value, h.new_value, h.timestamp, t.title as task_title
    FROM task_history h
    INNER JOIN tasks t ON t.id = h.task_id
    ${whereSql}
    ORDER BY h.timestamp DESC
    LIMIT 16
  `).all(...params) as HistoryEvidenceRow[]

  return rows.map((row, index) => {
    const oldText = valueToText(row.old_value)
    const newText = valueToText(row.new_value)
    const matchedText = compactText(`动作: ${row.action}\n旧值: ${oldText}\n新值: ${newText}`)
    return {
      id: `recent-history-${row.id}`,
      source: 'history',
      taskId: row.task_id,
      taskTitle: row.task_title,
      matchedText,
      snippet: buildSnippet(matchedText, []),
      timestamp: row.timestamp,
      score: 0.8 - index * 0.01,
    }
  })
}

function dedupeEvidences(evidences: TaskAskEvidence[]): TaskAskEvidence[] {
  const seen = new Set<string>()
  const deduped: TaskAskEvidence[] = []

  for (const evidence of evidences) {
    const key = `${evidence.source}:${evidence.taskId}:${evidence.timestamp || ''}:${evidence.snippet}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(evidence)
  }

  return deduped
}

export function collectTaskAskEvidences(
  db: Database.Database,
  request: TaskAskRequest,
  maxEvidence = 12
): TaskAskEvidence[] {
  const effectiveScope = inferScopeFromQuestion(request.question, request.scope)
  const intent = detectAskIntent(request.question)
  const terms = buildQueryTerms(request.question)
  if (terms.length === 0) {
    return []
  }

  const sources = getSources(effectiveScope)

  if (intent === 'created_tasks' && sources.has('history')) {
    const createdEvidences = queryRecentHistoryEvidence(db, effectiveScope, ['created'])
    if (createdEvidences.length > 0) {
      return createdEvidences.slice(0, maxEvidence)
    }
  }

  const evidences: TaskAskEvidence[] = []

  if (sources.has('tasks')) {
    evidences.push(...queryTaskEvidence(db, terms, effectiveScope))
  }
  if (sources.has('history')) {
    evidences.push(...queryHistoryEvidence(db, terms, effectiveScope))
  }
  if (sources.has('ocr')) {
    evidences.push(...queryOcrEvidence(db, terms, effectiveScope))
  }

  const scoredEvidences = dedupeEvidences(evidences)
    .filter(evidence => evidence.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    })

  if (scoredEvidences.length > 0) {
    return scoredEvidences.slice(0, maxEvidence)
  }

  const fallbackEvidences: TaskAskEvidence[] = []
  if (sources.has('history')) {
    fallbackEvidences.push(...queryRecentHistoryEvidence(db, effectiveScope))
  }
  if (sources.has('tasks')) {
    const existingTaskIds = new Set(fallbackEvidences.map(evidence => evidence.taskId))
    fallbackEvidences.push(
      ...queryRecentTaskEvidence(db, effectiveScope)
        .filter(evidence => !existingTaskIds.has(evidence.taskId))
    )
  }

  return dedupeEvidences(fallbackEvidences)
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, maxEvidence)
}

function buildAnswerPrompt(request: TaskAskRequest, evidences: TaskAskEvidence[]): string {
  const scopeText = [
    request.scope?.startDate || request.scope?.endDate
      ? `时间范围: ${request.scope?.startDate || '不限'} 至 ${request.scope?.endDate || '不限'}`
      : '时间范围: 全部',
    request.scope?.status && request.scope.status !== 'all' ? `状态: ${request.scope.status}` : '状态: 全部',
  ].join('\n')

  const evidenceText = evidences
    .map((evidence, index) => {
      const timestamp = evidence.timestamp ? `\n时间: ${evidence.timestamp}` : ''
      return `[${index + 1}] 来源: ${SOURCE_LABELS[evidence.source]}
任务: ${evidence.taskTitle} (#${evidence.taskId})${timestamp}
内容: ${evidence.snippet}`
    })
    .join('\n\n')

  return `你是一个严谨的个人任务库问答助手。请只根据下面的证据回答用户问题。

规则:
- 如果证据不足，请直接说明没有足够记录，不要编造。
- 先给结论，再列出关键依据。
- 回答要简洁、可执行，使用中文。
- 涉及事实时在句末标注证据编号，例如 [1]。
- 不要提到这些规则。

用户问题:
${request.question}

${scopeText}

证据:
${evidenceText}`
}

export async function generateTaskAskAnswer(
  config: AskLLMConfig,
  request: TaskAskRequest,
  evidences: TaskAskEvidence[]
): Promise<string> {
  const { apiKey, baseUrl, model = 'gpt-3.5-turbo', timeout = 30, verifySSL = true } = config
  const apiUrl = normalizeChatCompletionsUrl(baseUrl)

    const response = await postJsonWithElectronNet<{
      choices: Array<{
        message: {
          content: string
        }
      }>
    }>(apiUrl, {
      apiKey,
      timeout,
      verifySSL,
      body: {
        model,
        messages: [
          {
            role: 'user',
            content: buildAnswerPrompt(request, evidences),
          },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      },
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`LLM API 调用失败: ${response.statusCode} ${response.bodyText}`)
    }

    return response.data.choices[0]?.message?.content || '没有生成有效回答。'
}
