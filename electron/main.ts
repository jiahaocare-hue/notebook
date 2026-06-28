import { app, BrowserWindow, Menu, shell, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import { generateEmbedding } from './services/embedding'
import { extractText } from './services/ocr'
import { getDataDir } from './services/config'
import { backupDatabaseIfNeeded, cleanupDanglingDatabaseReferences, ensureMigrationTable, runDatabaseMigration } from './services/database'
import { ensureImagesDir, extractLocalImagePaths, resolveImageFilePath as resolveImageFilePathInDir } from './services/images'
import { logger } from './services/logger'
import { registerAppHandlers, registerAutoUpdaterLifecycle } from './ipc/app'
import { registerConfigHandlers } from './ipc/config'
import { registerDialogHandlers } from './ipc/dialogs'
import { registerFileHandlers } from './ipc/files'
import { registerImageHandlers } from './ipc/imageHandlers'
import { registerLlmHandlers } from './ipc/llm'
import { registerOcrHandlers } from './ipc/ocr'
import { registerSearchHandlers } from './ipc/search'
import { registerTaskHandlers } from './ipc/tasks'

let mainWindow: BrowserWindow | null = null
let db: Database.Database | null = null
let activeDataDir: string | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])
const isDev = !app.isPackaged

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

function createWindow() {
  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'resources', 'icon.ico')
    : path.join(__dirname, '../resources/icon.ico')
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev,
    },
    title: 'Task Manager',
    show: false,
    focusable: true,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppUrl(url)) {
      return
    }

    event.preventDefault()
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    }
  })

  Menu.setApplicationMenu(null)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function isAllowedAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (isDev) {
      return parsed.protocol === 'http:' && parsed.hostname === 'localhost' && parsed.port === '5173'
    }
    return parsed.protocol === 'file:'
  } catch {
    return false
  }
}

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function getActiveDataDir(): string {
  return activeDataDir || getDataDir(isDev, __dirname)
}

function initDatabase() {
  try {
    const dataDir = getDataDir(isDev, __dirname)
    activeDataDir = dataDir
    const dbPath = path.join(dataDir, 'tasks.db')
    
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    backupDatabaseIfNeeded(dbPath)
    
    db = new Database(dbPath)
    
    db.exec('PRAGMA foreign_keys = OFF')
    ensureMigrationTable(db)

    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'in_progress',
        priority TEXT DEFAULT 'medium',
        due_date TEXT,
        parent_id INTEGER DEFAULT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS task_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS task_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        embedding TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS image_texts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        image_path TEXT NOT NULL,
        text_content TEXT,
        ocr_status TEXT DEFAULT 'pending',
        ocr_error TEXT,
        ocr_timestamp TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `)
    runDatabaseMigration(db, '001_core_task_tables', 'Record core task, history, embedding, and image table baseline', () => {})
    
    try {
      db.exec(`ALTER TABLE image_texts ADD COLUMN task_id_temp INTEGER`)
      db.exec(`UPDATE image_texts SET task_id_temp = task_id`)
      db.exec(`CREATE TABLE image_texts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        image_path TEXT NOT NULL,
        text_content TEXT,
        ocr_status TEXT DEFAULT 'pending',
        ocr_error TEXT,
        ocr_timestamp TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )`)
      db.exec(`INSERT INTO image_texts_new SELECT id, task_id, image_path, text_content, ocr_status, ocr_error, ocr_timestamp, created_at FROM image_texts`)
      db.exec(`DROP TABLE image_texts`)
      db.exec(`ALTER TABLE image_texts_new RENAME TO image_texts`)
    } catch {
      // 表结构已经是正确的，忽略错误
    }

    runDatabaseMigration(db, '002_image_texts_fk_shape', 'Record image_texts foreign key shape baseline', () => {})

    db.exec(`
      CREATE TABLE IF NOT EXISTS ocr_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        image_path TEXT,
        status TEXT NOT NULL,
        message TEXT,
        error TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    runDatabaseMigration(db, '003_ocr_logs_table', 'Record OCR logs table baseline', () => {})

    const imageTextsInfo = db.prepare('PRAGMA table_info(image_texts)').all() as { name: string }[]
    const existingColumns = imageTextsInfo.map(col => col.name)
    
    if (!existingColumns.includes('ocr_status')) {
      db.exec('ALTER TABLE image_texts ADD COLUMN ocr_status TEXT DEFAULT \'pending\'')
    }
    if (!existingColumns.includes('ocr_error')) {
      db.exec('ALTER TABLE image_texts ADD COLUMN ocr_error TEXT')
    }
    if (!existingColumns.includes('ocr_timestamp')) {
      db.exec('ALTER TABLE image_texts ADD COLUMN ocr_timestamp TEXT')
    }

    // 迁移：为 tasks 表新增 parent_id 和 sort_order 字段
    runDatabaseMigration(db, '004_image_texts_ocr_columns', 'Record image_texts OCR column baseline', () => {})

    const tasksInfo = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    const taskColumns = tasksInfo.map(col => col.name)
    if (!taskColumns.includes('parent_id')) {
      db.exec('ALTER TABLE tasks ADD COLUMN parent_id INTEGER DEFAULT NULL')
    }
    if (!taskColumns.includes('sort_order')) {
      db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0')
    }

    runDatabaseMigration(db, '005_tasks_hierarchy_columns', 'Record task hierarchy column baseline', () => {})

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_sort ON tasks(parent_id, sort_order, created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
      CREATE INDEX IF NOT EXISTS idx_task_history_task_timestamp ON task_history(task_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_task_embeddings_task ON task_embeddings(task_id);
      CREATE INDEX IF NOT EXISTS idx_image_texts_task_path ON image_texts(task_id, image_path);
      CREATE INDEX IF NOT EXISTS idx_ocr_logs_timestamp ON ocr_logs(timestamp);
    `)

    runDatabaseMigration(db, '006_common_indexes', 'Record common index baseline', () => {})

    cleanupDanglingDatabaseReferences(db)
    db.exec('PRAGMA foreign_keys = ON')

    const foreignKeyIssues = db.prepare('PRAGMA foreign_key_check').all()
    if (foreignKeyIssues.length > 0) {
      logger.warn('[Database] Foreign key check found issues:', foreignKeyIssues)
    }
  } catch (error) {
    logger.error('Failed to initialize database:', error)
    app.quit()
  }
}

async function backfillEmbeddings() {
  try {
    const EXPECTED_DIMENSION = 512
    
    const existingEmbedding = db?.prepare('SELECT embedding FROM task_embeddings LIMIT 1').get() as { embedding: string } | undefined
    
    if (existingEmbedding?.embedding) {
      const parsed = JSON.parse(existingEmbedding.embedding)
      if (Array.isArray(parsed) && parsed.length !== EXPECTED_DIMENSION) {
        logger.info(`[Migration] Embedding dimension mismatch: ${parsed.length} != ${EXPECTED_DIMENSION}, regenerating all embeddings...`)
        db?.exec('DELETE FROM task_embeddings')
        embeddingVectorCache.clear()
      }
    }
    
    const tasksWithoutEmbeddings = db?.prepare(`
      SELECT t.id, t.title, t.description 
      FROM tasks t 
      LEFT JOIN task_embeddings e ON t.id = e.task_id 
      WHERE e.id IS NULL
    `).all() as { id: number; title: string; description: string | null }[]

    if (tasksWithoutEmbeddings && tasksWithoutEmbeddings.length > 0) {
      logger.info(`[Migration] Regenerating embeddings for ${tasksWithoutEmbeddings.length} tasks...`)
      for (const task of tasksWithoutEmbeddings) {
        await updateTaskEmbedding(task.id, task.title, task.description)
      }
      logger.info('[Migration] Embedding regeneration complete')
    }
  } catch (error) {
    logger.error('Failed to backfill embeddings:', error)
  }
}

async function _backfillImageTexts() {
  try {
    const tasksWithImages = db?.prepare(`
      SELECT t.id as task_id, t.description 
      FROM tasks t 
      WHERE t.description LIKE '%![%](%)%'
    `).all() as { task_id: number; description: string }[]

    if (!tasksWithImages || tasksWithImages.length === 0) {
      return
    }

    for (const task of tasksWithImages) {
      const imageMatches = [...task.description.matchAll(/!\[.*?\]\(([^)]+)\)/g)]
      
      for (const match of imageMatches) {
        let imagePath = match[1]
        if (imagePath.startsWith('local://')) {
          imagePath = imagePath.replace('local://', '')
        }
        
        const existingRecord = db?.prepare(`
          SELECT 1 FROM image_texts 
          WHERE task_id = ? AND image_path = ? AND ocr_status = 'success'
        `).get(task.task_id, imagePath)
        
        if (existingRecord) {
          continue
        }
        
        const resolvedPath = resolveImageFilePath(imagePath)
        if (resolvedPath.success && fs.existsSync(resolvedPath.fullPath)) {
          const ocrResult = await extractText(resolvedPath.fullPath, mainWindow)
          
          db?.prepare('INSERT INTO ocr_logs (task_id, image_path, status, message, error) VALUES (?, ?, ?, ?, ?)').run(
            task.task_id,
            imagePath,
            ocrResult.success ? 'success' : 'failed',
            ocrResult.success ? `识别完成，文字长度: ${ocrResult.text.length}` : null,
            ocrResult.error || null
          )
          
          if (ocrResult.success && ocrResult.text) {
            db?.prepare('INSERT OR REPLACE INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_timestamp) VALUES (?, ?, ?, ?, ?)').run(
              task.task_id, 
              imagePath, 
              ocrResult.text,
              'success',
              ocrResult.timestamp
            )
          } else {
            db?.prepare('INSERT OR REPLACE INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_error, ocr_timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
              task.task_id, 
              imagePath, 
              '',
              'failed',
              ocrResult.error || 'Unknown error',
              ocrResult.timestamp
            )
          }
        }
      }
    }
  } catch (error) {
    logger.error('Failed to backfill image texts:', error)
  }
}

async function updateTaskEmbedding(taskId: number, title: string, description: string | null) {
  try {
    const text = description ? `${title} ${description}` : title
    const embedding = await generateEmbedding(text)
    
    const existingEmbedding = db?.prepare('SELECT id FROM task_embeddings WHERE task_id = ?').get(taskId)
    
    if (existingEmbedding) {
      db?.prepare('UPDATE task_embeddings SET embedding = ?, created_at = CURRENT_TIMESTAMP WHERE task_id = ?').run(JSON.stringify(embedding), taskId)
    } else {
      db?.prepare('INSERT INTO task_embeddings (task_id, embedding) VALUES (?, ?)').run(taskId, JSON.stringify(embedding))
    }
    embeddingVectorCache.delete(taskId)
  } catch (error) {
    logger.error('Failed to update embedding:', error)
  }
}

app.whenReady().then(async () => {
  initDatabase()
  registerImageProtocol()
  createWindow()
  
  setTimeout(async () => {
    try {
      await backfillEmbeddings()
      if (db) {
        cleanupDanglingDatabaseReferences(db)
      }
      cleanupOrphanImageFiles()
    } catch (error) {
      logger.error('Failed to backfill data:', error)
    }
  }, 1000)

  registerAutoUpdaterLifecycle({ isDev, getMainWindow: () => mainWindow })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db?.close()
    app.quit()
  }
})

const embeddingVectorCache = new Map<number, { source: string; vector: number[] }>()

function parseEmbeddingVector(taskId: number, embedding: string): number[] {
  const cached = embeddingVectorCache.get(taskId)
  if (cached?.source === embedding) {
    return cached.vector
  }

  const vector = JSON.parse(embedding) as number[]
  embeddingVectorCache.set(taskId, { source: embedding, vector })
  return vector
}

function getImagesDir(): string {
  return ensureImagesDir(getActiveDataDir())
}

function resolveImageFilePath(imagePath: string): { success: true; fullPath: string } | { success: false; error: string } {
  return resolveImageFilePathInDir(getImagesDir(), imagePath)
}

function registerImageProtocol(): void {
  if (protocol.isProtocolRegistered('app-image')) {
    return
  }

  protocol.registerFileProtocol('app-image', (request, callback) => {
    try {
      const parsed = new URL(request.url)
      if (parsed.hostname !== 'local') {
        callback({ error: -10 })
        return
      }

      const imagePath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
      const resolvedPath = resolveImageFilePath(imagePath)
      if (!resolvedPath.success || !fs.existsSync(resolvedPath.fullPath)) {
        callback({ error: -6 })
        return
      }

      callback({ path: resolvedPath.fullPath })
    } catch (error) {
      logger.error('Failed to resolve app-image URL:', error)
      callback({ error: -2 })
    }
  })
}

function collectReferencedImagePaths(): Set<string> {
  const referencedPaths = new Set<string>()
  const taskRows = db?.prepare('SELECT description FROM tasks WHERE description LIKE ?').all('%local://%') as { description: string | null }[] || []
  for (const row of taskRows) {
    for (const imagePath of extractLocalImagePaths(row.description)) {
      referencedPaths.add(imagePath)
    }
  }

  const imageRows = db?.prepare(`
    SELECT image_path
    FROM image_texts
    WHERE task_id IS NOT NULL
      AND task_id IN (SELECT id FROM tasks)
  `).all() as { image_path: string }[] || []
  for (const row of imageRows) {
    referencedPaths.add(row.image_path)
  }

  return referencedPaths
}

function cleanupOrphanImageFiles(minAgeMs = 24 * 60 * 60 * 1000): void {
  try {
    const imagesDir = getImagesDir()
    const referencedPaths = collectReferencedImagePaths()
    const cutoffTime = Date.now() - minAgeMs
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
    let removedCount = 0

    for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
      if (!entry.isFile() || referencedPaths.has(entry.name)) {
        continue
      }

      if (!imageExtensions.has(path.extname(entry.name).toLowerCase())) {
        continue
      }

      const resolvedPath = resolveImageFilePath(entry.name)
      if (!resolvedPath.success) {
        continue
      }

      const stats = fs.statSync(resolvedPath.fullPath)
      if (stats.mtimeMs > cutoffTime) {
        continue
      }

      fs.unlinkSync(resolvedPath.fullPath)
      db?.prepare(`
        DELETE FROM image_texts
        WHERE image_path = ?
          AND (task_id IS NULL OR task_id NOT IN (SELECT id FROM tasks))
      `).run(entry.name)
      removedCount++
    }

    if (removedCount > 0) {
      logger.info(`[image:cleanup] Removed ${removedCount} orphan image file(s)`)
    }
  } catch (error) {
    logger.error('Failed to clean orphan image files:', error)
  }
}

registerTaskHandlers({
  getDb: () => db,
  resolveImageFilePath,
  updateTaskEmbedding,
})
registerSearchHandlers({
  getDb: () => db,
  parseEmbeddingVector,
})
registerImageHandlers({
  getDb: () => db,
  getImagesDir,
  getMainWindow: () => mainWindow,
  resolveImageFilePath,
})
registerConfigHandlers({ isDev, appRootDir: __dirname, getActiveDataDir })
registerDialogHandlers({ getMainWindow: () => mainWindow })
registerLlmHandlers()
registerFileHandlers({ getMainWindow: () => mainWindow })
registerAppHandlers({ isDev, getMainWindow: () => mainWindow })
registerOcrHandlers({
  getDb: () => db,
  getMainWindow: () => mainWindow,
  resolveImageFilePath,
})
