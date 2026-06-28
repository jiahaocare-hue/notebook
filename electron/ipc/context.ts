import type { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import type { ImagePathResult } from '../services/images'

export type MainWindowGetter = () => BrowserWindow | null
export type DatabaseGetter = () => Database.Database | null

export type ImagePathResolver = (imagePath: string) => ImagePathResult

