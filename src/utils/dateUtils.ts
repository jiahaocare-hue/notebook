export const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const formatDisplayDate = (dateStr: string): string => {
  const date = parseDateString(dateStr)
  if (!date) return ''
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export const parseDateString = (dateStr: string): Date | null => {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? null : date
}

export const isSameDay = (date1: Date | null, date2: Date | null): boolean => {
  if (!date1 || !date2) return false
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

export const getMonthDateRange = (year: number, month: number): { startDate: string; endDate: string } => {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  return {
    startDate: formatDateLocal(firstDay),
    endDate: formatDateLocal(lastDay)
  }
}
