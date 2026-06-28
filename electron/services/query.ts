export const SQLITE_VARIABLE_BATCH_SIZE = 900

function toSqliteUtcTimestamp(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function getLocalDayBoundary(dateText: string, offsetDays = 0): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return null
  }

  const [year, month, day] = dateText.split('-').map(Number)
  const boundary = new Date(year, month - 1, day + offsetDays, 0, 0, 0, 0)

  if (Number.isNaN(boundary.getTime())) {
    return null
  }

  return toSqliteUtcTimestamp(boundary)
}

export function buildDateRangeCondition(column: string, startDate?: string, endDate?: string): { sql: string; params: string[] } | null {
  const clauses: string[] = []
  const params: string[] = []

  if (startDate) {
    const start = getLocalDayBoundary(startDate)
    if (start) {
      clauses.push(`${column} >= ?`)
      params.push(start)
    }
  }

  if (endDate) {
    const endExclusive = getLocalDayBoundary(endDate, 1)
    if (endExclusive) {
      clauses.push(`${column} < ?`)
      params.push(endExclusive)
    }
  }

  if (clauses.length === 0) {
    return null
  }

  return {
    sql: clauses.join(' AND '),
    params,
  }
}

export function buildTaskDateFilter(
  dateField: string | null,
  filters?: { date?: string; startDate?: string; endDate?: string }
): { sql: string; params: string[] } | null {
  const startDate = filters?.date || filters?.startDate
  const endDate = filters?.date || filters?.endDate

  if (!startDate && !endDate) {
    return null
  }

  if (dateField) {
    return buildDateRangeCondition(dateField, startDate, endDate)
  }

  const createdFilter = buildDateRangeCondition('created_at', startDate, endDate)
  const updatedFilter = buildDateRangeCondition('updated_at', startDate, endDate)

  if (!createdFilter || !updatedFilter) {
    return null
  }

  return {
    sql: `(${createdFilter.sql}) OR (${updatedFilter.sql})`,
    params: [...createdFilter.params, ...updatedFilter.params],
  }
}

export function getDateFieldFromMode(dateFilterMode?: string): string | null {
  if (dateFilterMode === 'updated') {
    return 'updated_at'
  }
  if (dateFilterMode === 'created_or_updated') {
    return null
  }
  return 'created_at'
}

export function buildPlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',')
}

export function chunkArray<T>(items: T[], size = SQLITE_VARIABLE_BATCH_SIZE): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export function uniquePositiveIds(ids: number[]): number[] {
  return Array.from(new Set((ids || []).filter(id => Number.isInteger(id) && id > 0)))
}
