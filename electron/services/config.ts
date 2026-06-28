import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from './logger'

export interface LLMConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  timeout?: number
  verifySSL?: boolean
  promptTemplate?: string
}

export interface AppConfig {
  dataDir?: string
  llm?: LLMConfig
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): AppConfig {
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(content)
    }
  } catch (error) {
    logger.error('Failed to load config:', error)
  }

  return {}
}

export function saveConfig(config: AppConfig): boolean {
  try {
    const configPath = getConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    logger.error('Failed to save config:', error)
    return false
  }
}

export function maskApiKey(apiKey?: string | null): string | null {
  if (!apiKey) {
    return null
  }

  return `********${apiKey.slice(-4)}`
}

export function resolveIncomingApiKey(
  existingApiKey: string | undefined,
  incomingApiKey: string | undefined
): string | undefined {
  if (incomingApiKey === undefined) {
    return existingApiKey
  }

  if (existingApiKey && incomingApiKey === maskApiKey(existingApiKey)) {
    return existingApiKey
  }

  return incomingApiKey
}

export function getDefaultDataDir(isDev: boolean, electronDirname: string): string {
  if (isDev) {
    return path.join(electronDirname, '..', 'data')
  }

  return path.join(app.getPath('userData'), 'data')
}

export function getDataDir(isDev: boolean, electronDirname: string): string {
  const config = loadConfig()
  if (config.dataDir && fs.existsSync(config.dataDir)) {
    return config.dataDir
  }

  return getDefaultDataDir(isDev, electronDirname)
}
