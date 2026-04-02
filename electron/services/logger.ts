import { app } from 'electron'
import fs from 'fs'
import path from 'path'

type LogLevel = 'info' | 'warn' | 'error'

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

function formatMessage(level: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString()
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ')
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`
}

function writeToFile(message: string): void {
  const logFile = getLogFilePath()
  try {
    fs.appendFileSync(logFile, message + '\n', 'utf-8')
  } catch (error) {
    console.error('Failed to write log file:', error)
  }
}

function log(level: LogLevel, ...args: unknown[]): void {
  const message = formatMessage(level, ...args)

  switch (level) {
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
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
}
