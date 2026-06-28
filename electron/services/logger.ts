import { app } from 'electron'
import fs from 'fs'
import path from 'path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const DEFAULT_LOG_LEVEL: LogLevel = 'info'
const MAX_LOG_FILE_SIZE = 2 * 1024 * 1024
const MAX_ROTATED_LOG_FILES = 5

function getCurrentLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase()
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
    return level
  }
  return DEFAULT_LOG_LEVEL
}

function getLogDir(): string {
  const userData = app.getPath('userData')
  const logDir = path.join(userData, 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return logDir
}

function getLogFilePath(): string {
  const logDir = getLogDir()
  return path.join(logDir, 'app.log')
}

function rotateLogIfNeeded(logFile: string): void {
  if (!fs.existsSync(logFile)) {
    return
  }

  const stats = fs.statSync(logFile)
  if (stats.size < MAX_LOG_FILE_SIZE) {
    return
  }

  for (let index = MAX_ROTATED_LOG_FILES - 1; index >= 1; index--) {
    const source = `${logFile}.${index}`
    const target = `${logFile}.${index + 1}`
    if (fs.existsSync(source)) {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target)
      }
      fs.renameSync(source, target)
    }
  }

  const firstRotatedFile = `${logFile}.1`
  if (fs.existsSync(firstRotatedFile)) {
    fs.unlinkSync(firstRotatedFile)
  }
  fs.renameSync(logFile, firstRotatedFile)
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`
  }

  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  }

  return String(arg)
}

function formatMessage(level: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString()
  const message = args.map(stringifyArg).join(' ')
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`
}

function writeToFile(message: string): void {
  const logFile = getLogFilePath()
  try {
    rotateLogIfNeeded(logFile)
    fs.appendFileSync(logFile, message + '\n', 'utf-8')
  } catch (error) {
    console.error('Failed to write log file:', error)
  }
}

function log(level: LogLevel, ...args: unknown[]): void {
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[getCurrentLogLevel()]) {
    return
  }

  const message = formatMessage(level, ...args)

  switch (level) {
    case 'debug':
      console.debug(message)
      break
    case 'info':
      console.log(message)
      break
    case 'warn':
      console.warn(message)
      break
    case 'error':
      console.error(message)
      break
  }

  writeToFile(message)
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
}
