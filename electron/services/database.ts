import type Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { logger } from './logger'

export function backupDatabaseIfNeeded(dbPath: string): void {
  try {
    if (!fs.existsSync(dbPath)) {
      return
    }

    const stats = fs.statSync(dbPath)
    if (stats.size === 0) {
      return
    }

    const backupDir = path.join(path.dirname(dbPath), 'backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const today = new Date().toISOString().slice(0, 10)
    const existingTodayBackup = fs.readdirSync(backupDir).some(file => file.startsWith(`tasks-${today}-`) && file.endsWith('.db'))
    if (!existingTodayBackup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      fs.copyFileSync(dbPath, path.join(backupDir, `tasks-${timestamp}.db`))
      logger.info('[Database] Backup created before initialization')
    }

    const backups = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('tasks-') && file.endsWith('.db'))
      .map(file => ({
        file,
        mtimeMs: fs.statSync(path.join(backupDir, file)).mtimeMs
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    for (const backup of backups.slice(10)) {
      fs.unlinkSync(path.join(backupDir, backup.file))
    }
  } catch (error) {
    logger.error('Failed to backup database:', error)
  }
}

export function ensureMigrationTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

export function runDatabaseMigration(
  database: Database.Database,
  id: string,
  description: string,
  migrate: () => void
): void {
  const existing = database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(id) as { id: string } | undefined
  if (existing) {
    return
  }

  const transaction = database.transaction(() => {
    migrate()
    database
      .prepare('INSERT INTO schema_migrations (id, description) VALUES (?, ?)')
      .run(id, description)
  })

  transaction()
  logger.info(`[Database] Migration applied: ${id} ${description}`)
}

export function cleanupDanglingDatabaseReferences(database: Database.Database): void {
  try {
    database.exec(`
      DELETE FROM task_history
      WHERE task_id NOT IN (SELECT id FROM tasks);

      DELETE FROM task_embeddings
      WHERE task_id NOT IN (SELECT id FROM tasks);

      UPDATE image_texts
      SET task_id = NULL
      WHERE task_id IS NOT NULL
        AND task_id NOT IN (SELECT id FROM tasks);

      UPDATE ocr_logs
      SET task_id = NULL
      WHERE task_id IS NOT NULL
        AND task_id NOT IN (SELECT id FROM tasks);

      UPDATE tasks
      SET parent_id = NULL
      WHERE parent_id IS NOT NULL
        AND parent_id NOT IN (SELECT id FROM tasks);
    `)
  } catch (error) {
    logger.error('Failed to clean dangling database references:', error)
  }
}
