import { app, BrowserWindow, ipcMain, Menu, clipboard, nativeImage, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import { generateEmbedding, cosineSimilarity } from './services/embedding'
import { extractText } from './services/ocr'
import { generateSummary, SummaryRequest } from './services/llm'
import { autoUpdater } from 'electron-updater'
import { logger } from './services/logger'

let mainWindow: BrowserWindow | null = null
let db: Database.Database | null = null
let manualUpdateCheck = false
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

  Menu.setApplicationMenu(null)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function getConfigPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'config.json')
}

interface LLMConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  timeout?: number
  verifySSL?: boolean
  promptTemplate?: string
}

interface AppConfig {
  dataDir?: string
  llm?: LLMConfig
}

function loadConfig(): AppConfig {
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

function saveConfig(config: AppConfig): boolean {
  try {
    const configPath = getConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    logger.error('Failed to save config:', error)
    return false
  }
}

function getDataDir(): string {
  const config = loadConfig()
  if (config.dataDir && fs.existsSync(config.dataDir)) {
    return config.dataDir
  }
  
  if (isDev) {
    return path.join(__dirname, '..', 'data')
  }
  return path.join(app.getPath('userData'), 'data')
}

function initDatabase() {
  try {
    const dataDir = getDataDir()
    const dbPath = path.join(dataDir, 'tasks.db')
    
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    
    db = new Database(dbPath)
    
    db.exec('PRAGMA foreign_keys = OFF')

    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'in_progress',
        priority TEXT DEFAULT 'medium',
        due_date TEXT,
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
    } catch (e) {
      // 表结构已经是正确的，忽略错误
    }

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

async function backfillImageTexts() {
  try {
    const tasksWithImages = db?.prepare(`
      SELECT t.id as task_id, t.description 
      FROM tasks t 
      WHERE t.description LIKE '%![%](%)%'
    `).all() as { task_id: number; description: string }[]

    if (!tasksWithImages || tasksWithImages.length === 0) {
      return
    }

    const imagesDir = getImagesDir()
    let processedCount = 0
    
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
        
        const fullPath = path.join(imagesDir, imagePath)
        
        if (fs.existsSync(fullPath)) {
          processedCount++
          const ocrResult = await extractText(fullPath, mainWindow)
          
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

function addHistoryRecord(taskId: number, action: string, oldValue: string | null, newValue: string | null) {
  const stmt = db?.prepare('INSERT INTO task_history (task_id, action, old_value, new_value) VALUES (?, ?, ?, ?)')
  stmt?.run(taskId, action, oldValue, newValue)
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
  } catch (error) {
    logger.error('Failed to update embedding:', error)
  }
}

app.whenReady().then(async () => {
  initDatabase()
  createWindow()
  
  setTimeout(async () => {
    try {
      await backfillEmbeddings()
    } catch (error) {
      logger.error('Failed to backfill data:', error)
    }
  }, 1000)

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否前往下载？`,
      buttons: ['前往下载', '稍后提醒'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        shell.openExternal('https://github.com/jiahaocare-hue/notebook/releases/latest')
      }
    })
  })

  autoUpdater.on('update-not-available', () => {
    if (manualUpdateCheck) {
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本',
        buttons: ['确定']
      })
      manualUpdateCheck = false
    }
  })

  autoUpdater.on('error', (error) => {
    logger.error('Auto updater error:', error)
    if (manualUpdateCheck) {
      dialog.showMessageBox(mainWindow!, {
        type: 'error',
        title: '检查更新失败',
        message: '检查更新时发生错误，请稍后重试',
        buttons: ['确定']
      })
      manualUpdateCheck = false
    }
  })

  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates()
    }, 3000)
  }

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

ipcMain.handle('task:create', async (_event, task: { title: string; description?: string; status?: string; priority?: string; due_date?: string }) => {
  const stmt = db?.prepare('INSERT INTO tasks (title, description, status, priority, due_date) VALUES (?, ?, ?, ?, ?)')
  const result = stmt?.run(task.title, task.description || null, task.status || 'in_progress', task.priority || 'medium', task.due_date || null)
  const taskId = result?.lastInsertRowid as number

  if (taskId) {
    addHistoryRecord(taskId, 'created', null, JSON.stringify({ title: task.title, description: task.description, status: task.status || 'in_progress', priority: task.priority || 'medium', due_date: task.due_date }))
    updateTaskEmbedding(taskId, task.title, task.description || null).catch(err => logger.error('Failed to generate embedding:', err))
    
    if (task.description) {
      const imageMatches = [...task.description.matchAll(/!\[.*?\]\(local:\/\/([^)]+)\)/g)]
      for (const match of imageMatches) {
        const imagePath = match[1]
        db?.prepare('UPDATE image_texts SET task_id = ? WHERE image_path = ? AND (task_id IS NULL OR task_id = 0)').run(taskId, imagePath)
      }
    }
  }

  return taskId
})

ipcMain.handle('task:update', async (_event, taskId: number, task: { title?: string; description?: string; status?: string; priority?: string; due_date?: string }) => {
  const getStmt = db?.prepare('SELECT * FROM tasks WHERE id = ?')
  const oldTask = getStmt?.get(taskId) as { title: string; description: string; status: string; priority: string; due_date: string | null } | undefined

  if (!oldTask) {
    return false
  }

  const updates: string[] = []
  const values: (string | null)[] = []
  const changes: { old: Record<string, unknown>; new: Record<string, unknown> } = { old: {}, new: {} }

  if (task.title !== undefined && task.title !== oldTask.title) {
    updates.push('title = ?')
    values.push(task.title)
    changes.old.title = oldTask.title
    changes.new.title = task.title
  }

  if (task.description !== undefined && task.description !== oldTask.description) {
    updates.push('description = ?')
    values.push(task.description)
    changes.old.description = oldTask.description
    changes.new.description = task.description
  }

  if (task.status !== undefined && task.status !== oldTask.status) {
    updates.push('status = ?')
    values.push(task.status)
    changes.old.status = oldTask.status
    changes.new.status = task.status
  }

  if (task.priority !== undefined && task.priority !== oldTask.priority) {
    updates.push('priority = ?')
    values.push(task.priority)
    changes.old.priority = oldTask.priority
    changes.new.priority = task.priority
  }

  if (task.due_date !== undefined && task.due_date !== oldTask.due_date) {
    updates.push('due_date = ?')
    values.push(task.due_date || null)
    changes.old.due_date = oldTask.due_date
    changes.new.due_date = task.due_date
  }

  if (updates.length === 0) {
    return true
  }

  updates.push('updated_at = CURRENT_TIMESTAMP')
  values.push(String(taskId))

  const updateStmt = db?.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`)
  updateStmt?.run(...values)

  const action = task.status !== undefined && task.status !== oldTask.status ? 'status_changed' : 'updated'
  addHistoryRecord(taskId, action, JSON.stringify(changes.old), JSON.stringify(changes.new))

  if (task.title !== undefined || task.description !== undefined) {
    const newTitle = task.title !== undefined ? task.title : oldTask.title
    const newDescription = task.description !== undefined ? task.description : oldTask.description
    updateTaskEmbedding(taskId, newTitle, newDescription).catch(err => logger.error('Failed to generate embedding:', err))
  }

  return true
})

ipcMain.handle('task:delete', (_event, taskId: number) => {
  try {
    const getStmt = db?.prepare('SELECT * FROM tasks WHERE id = ?')
    const task = getStmt?.get(taskId) as { id: number; description: string | null } | undefined

    if (!task) {
      return false
    }

    const imagesDir = getImagesDir()
    const imageFiles: string[] = []
    
    if (task.description) {
      const imageMatches = [...task.description.matchAll(/!\[.*?\]\(local:\/\/([^)]+)\)/g)]
      for (const match of imageMatches) {
        imageFiles.push(match[1])
      }
    }

    try {
      const deleteTransaction = db?.transaction(() => {
        db?.exec('PRAGMA foreign_keys = OFF')
        try {
          db?.prepare('DELETE FROM task_embeddings WHERE task_id = ?').run(taskId)
          db?.prepare('DELETE FROM task_history WHERE task_id = ?').run(taskId)
          db?.prepare('DELETE FROM image_texts WHERE task_id = ?').run(taskId)
          db?.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
        } catch (innerError) {
          logger.error('Database transaction error during task deletion:', innerError)
          throw innerError
        } finally {
          db?.exec('PRAGMA foreign_keys = ON')
        }
      })

      deleteTransaction?.()
    } catch (transactionError) {
      logger.error('Failed to delete task from database:', transactionError)
      return false
    }

    for (const imageFile of imageFiles) {
      const fullPath = path.join(imagesDir, imageFile)
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath)
        } catch (e) {
          logger.error('Failed to delete image file:', fullPath, e)
        }
      }
    }

    return true
  } catch (error) {
    logger.error('Failed to delete task:', error)
    return false
  }
})

ipcMain.handle('task:get', (_event, taskId: number) => {
  const stmt = db?.prepare('SELECT * FROM tasks WHERE id = ?')
  return stmt?.get(taskId)
})

ipcMain.handle('task:list', (_event, filters?: { date?: string; status?: string; startDate?: string; endDate?: string }) => {
  let sql = 'SELECT * FROM tasks WHERE 1=1'
  const params: string[] = []

  if (filters?.date) {
    sql += " AND date(created_at, 'localtime') = ?"
    params.push(filters.date)
  }

  if (filters?.status) {
    sql += ' AND status = ?'
    params.push(filters.status)
  }

  if (filters?.startDate) {
    sql += " AND date(created_at, 'localtime') >= ?"
    params.push(filters.startDate)
  }

  if (filters?.endDate) {
    sql += " AND date(created_at, 'localtime') <= ?"
    params.push(filters.endDate)
  }

  sql += ' ORDER BY created_at DESC'

  const stmt = db?.prepare(sql)
  return stmt?.all(...params) || []
})

ipcMain.handle('task:getCounts', (_event, filters?: { date?: string; startDate?: string; endDate?: string }) => {
  let sql = 'SELECT status, COUNT(*) as count FROM tasks'
  const conditions: string[] = []
  const params: string[] = []

  if (filters?.date) {
    conditions.push("date(created_at, 'localtime') = ?")
    params.push(filters.date)
  }

  if (filters?.startDate) {
    conditions.push("date(created_at, 'localtime') >= ?")
    params.push(filters.startDate)
  }

  if (filters?.endDate) {
    conditions.push("date(created_at, 'localtime') <= ?")
    params.push(filters.endDate)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  sql += ' GROUP BY status'

  const stmt = db?.prepare(sql)
  const results = stmt?.all(...params) as { status: string; count: number }[] || []

  const counts = {
    all: 0,
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0
  }

  for (const row of results) {
    counts.all += row.count
    if (row.status === 'pending') counts.pending = row.count
    else if (row.status === 'in_progress') counts.in_progress = row.count
    else if (row.status === 'completed') counts.completed = row.count
    else if (row.status === 'cancelled') counts.cancelled = row.count
  }

  return counts
})

ipcMain.handle('history:getByTaskId', (_event, taskId: number, options?: { limit?: number; offset?: number }) => {
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const stmt = db?.prepare('SELECT * FROM task_history WHERE task_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?')
  return stmt?.all(taskId, limit, offset) || []
})

ipcMain.handle('search:keyword', (_event, query: string, options?: { fields?: string[]; limit?: number; startDate?: string; endDate?: string }) => {
  const limit = options?.limit || 50
  const fields = options?.fields || ['title', 'description']

  const conditions: string[] = []
  const params: string[] = []

  for (const field of fields) {
    if (['title', 'description'].includes(field)) {
      conditions.push(`${field} LIKE ?`)
      params.push(`%${query}%`)
    }
  }

  if (conditions.length === 0) {
    return []
  }

  let sql = `SELECT * FROM tasks WHERE ${conditions.join(' OR ')}`

  if (options?.startDate) {
    sql += " AND date(created_at, 'localtime') >= ?"
    params.push(options.startDate)
  }

  if (options?.endDate) {
    sql += " AND date(created_at, 'localtime') <= ?"
    params.push(options.endDate)
  }

  sql += ' ORDER BY created_at DESC LIMIT ?'
  params.push(String(limit))

  const stmt = db?.prepare(sql)
  return stmt?.all(...params) || []
})

ipcMain.handle('search:semantic', async (_event, query: string, options?: { limit?: number; threshold?: number; startDate?: string; endDate?: string }) => {
  const limit = options?.limit || 50
  const threshold = options?.threshold || 0.7

  try {
    const queryEmbedding = await generateEmbedding(query)

    let sql = `
      SELECT t.*, e.embedding 
      FROM tasks t 
      LEFT JOIN task_embeddings e ON t.id = e.task_id 
      WHERE e.embedding IS NOT NULL
    `
    const params: string[] = []

    if (options?.startDate) {
      sql += " AND date(t.created_at, 'localtime') >= ?"
      params.push(options.startDate)
    }

    if (options?.endDate) {
      sql += " AND date(t.created_at, 'localtime') <= ?"
      params.push(options.endDate)
    }

    const tasksWithEmbeddings = db?.prepare(sql).all(...params) as { id: number; title: string; description: string | null; status: string; priority: string; due_date: string | null; created_at: string; updated_at: string; embedding: string }[]

    const results = tasksWithEmbeddings
      .map(task => {
        const taskEmbedding = JSON.parse(task.embedding) as number[]
        const similarity = cosineSimilarity(queryEmbedding, taskEmbedding)
        return {
          ...task,
          embedding: undefined,
          similarity
        }
      })
      .filter(task => task.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    return { tasks: results }
  } catch (error) {
    logger.error('Semantic search error:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to perform semantic search',
      tasks: []
    }
  }
})

ipcMain.handle('search:hybrid', async (_event, query: string, options?: { limit?: number; keywordWeight?: number; threshold?: number; startDate?: string; endDate?: string }) => {
  logger.info('[search:hybrid] Starting search, query:', query)
  const limit = options?.limit || 50
  const keywordWeight = options?.keywordWeight || 0.3
  const semanticWeight = 1 - keywordWeight
  const threshold = options?.threshold || 0.7

  try {
    logger.info('[search:hybrid] Generating embedding for query...')
    const queryEmbedding = await generateEmbedding(query)
    logger.info('[search:hybrid] Embedding generated, dimension:', queryEmbedding.length)

    let keywordSql = `
      SELECT *, 1 as keyword_match from tasks 
      WHERE title LIKE ? OR description LIKE ?
    `
    const keywordParams: string[] = [`%${query}%`, `%${query}%`]

    if (options?.startDate) {
      keywordSql += " AND date(created_at, 'localtime') >= ?"
      keywordParams.push(options.startDate)
    }

    if (options?.endDate) {
      keywordSql += " AND date(created_at, 'localtime') <= ?"
      keywordParams.push(options.endDate)
    }

    const keywordResults = db?.prepare(keywordSql).all(...keywordParams) as { id: number; title: string; description: string | null; status: string; created_at: string; updated_at: string; keyword_match: number }[]

    let embeddingSql = `
      SELECT t.*, e.embedding 
      FROM tasks t 
      LEFT JOIN task_embeddings e ON t.id = e.task_id 
      WHERE e.embedding IS NOT NULL
    `
    const embeddingParams: string[] = []

    if (options?.startDate) {
      embeddingSql += " AND date(t.created_at, 'localtime') >= ?"
      embeddingParams.push(options.startDate)
    }

    if (options?.endDate) {
      embeddingSql += " AND date(t.created_at, 'localtime') <= ?"
      embeddingParams.push(options.endDate)
    }

    const tasksWithEmbeddings = db?.prepare(embeddingSql).all(...embeddingParams) as { id: number; title: string; description: string | null; status: string; priority: string; due_date: string | null; created_at: string; updated_at: string; embedding: string }[]

    const keywordMatchSet = new Set(keywordResults.map(t => t.id))

    const semanticResults = tasksWithEmbeddings.map(task => {
      const taskEmbedding = JSON.parse(task.embedding) as number[]
      const similarity = cosineSimilarity(queryEmbedding, taskEmbedding)
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        created_at: task.created_at,
        updated_at: task.updated_at,
        similarity,
        keywordMatch: keywordMatchSet.has(task.id) ? 1 : 0
      }
    })

    const combinedResults = semanticResults
      .map(task => ({
        ...task,
        combinedScore: task.keywordMatch * keywordWeight + task.similarity * semanticWeight
      }))
      .filter(task => task.keywordMatch === 1 || task.similarity >= threshold)
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit)

    return { tasks: combinedResults }
  } catch (error) {
    logger.error('[search:hybrid] Search failed:', error)
    logger.error('[search:hybrid] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return {
      error: error instanceof Error ? error.message : 'Failed to perform hybrid search',
      tasks: []
    }
  }
})

function getImagesDir(): string {
  const dataDir = getDataDir()
  const imagesDir = path.join(dataDir, 'images')
  
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }
  
  return imagesDir
}

ipcMain.handle('image:save', async (_event, imageData: string, fileName: string, taskId?: number) => {
  try {
    const imagesDir = getImagesDir()
    const timestamp = Date.now()
    const ext = path.extname(fileName) || '.png'
    const uniqueName = `${timestamp}_${Math.random().toString(36).substr(2, 9)}${ext}`
    const filePath = path.join(imagesDir, uniqueName)
    
    logger.info('[image:save] Saving file:', uniqueName)
    logger.info('[image:save] Full path:', filePath)
    
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(filePath, buffer)
    
    logger.info('[image:save] Image file saved:', uniqueName)
    
    try {
      logger.info('[image:save] Calling extractText...')
      const ocrResult = await extractText(filePath, mainWindow)
      logger.info('[image:save] extractText returned, success:', ocrResult.success, 'text length:', ocrResult.text?.length)
      
      logger.info('[image:save] Inserting into ocr_logs...')
      db?.prepare('INSERT INTO ocr_logs (task_id, image_path, status, message, error) VALUES (?, ?, ?, ?, ?)').run(
        taskId || null,
        uniqueName,
        ocrResult.success ? 'success' : 'failed',
        ocrResult.success ? `识别完成，文字长度: ${ocrResult.text.length}` : null,
        ocrResult.error || null
      )
      logger.info('[image:save] ocr_logs insert done')
      
      if (ocrResult.success && ocrResult.text) {
        logger.info('[image:save] Inserting into image_texts (success)...')
        db?.prepare('INSERT INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_timestamp) VALUES (?, ?, ?, ?, ?)').run(
          taskId || null, 
          uniqueName, 
          ocrResult.text,
          'success',
          ocrResult.timestamp
        )
        logger.info(`[image:save] OCR completed for task ${taskId || 'new'}, text length: ${ocrResult.text.length}`)
      } else {
        logger.info('[image:save] Inserting into image_texts (failed)...')
        db?.prepare('INSERT INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_error, ocr_timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
          taskId || null, 
          uniqueName, 
          '',
          'failed',
          ocrResult.error || 'Unknown error',
          ocrResult.timestamp
        )
        logger.info(`[image:save] OCR failed for image: ${uniqueName}, error: ${ocrResult.error}`)
      }
    } catch (ocrError) {
      logger.error('[image:save] OCR execution failed (image still saved):', ocrError)
      db?.prepare('INSERT INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_error, ocr_timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
        taskId || null, 
        uniqueName, 
        '',
        'failed',
        ocrError instanceof Error ? ocrError.message : 'OCR execution failed',
        new Date().toISOString()
      )
    }
    
    logger.info('[image:save] Returning:', { success: true, path: uniqueName })
    return { success: true, path: uniqueName }
  } catch (error) {
    logger.error('Failed to save image:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save image' }
  }
})

ipcMain.handle('image:load', (_event, imagePath: string) => {
  try {
    const imagesDir = getImagesDir()
    const fullPath = path.join(imagesDir, imagePath)
    
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'Image not found' }
    }
    
    const buffer = fs.readFileSync(fullPath)
    const base64 = buffer.toString('base64')
    const ext = path.extname(imagePath).toLowerCase()
    const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : 'image/png'
    
    return { success: true, data: `data:${mimeType};base64,${base64}` }
  } catch (error) {
    logger.error('Failed to load image:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load image' }
  }
})

ipcMain.handle('image:delete', (_event, imagePath: string) => {
  try {
    const imagesDir = getImagesDir()
    const fullPath = path.join(imagesDir, imagePath)
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
    
    return { success: true }
  } catch (error) {
    logger.error('Failed to delete image:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete image' }
  }
})

ipcMain.handle('search:image', (_event, query: string, options?: { limit?: number; startDate?: string; endDate?: string }) => {
  const limit = options?.limit || 50
  
  let sql = `
    SELECT DISTINCT t.* 
    FROM tasks t 
    INNER JOIN image_texts it ON t.id = it.task_id 
    WHERE it.text_content LIKE ?
  `
  const params: string[] = [`%${query}%`]
  
  if (options?.startDate) {
    sql += " AND date(t.created_at, 'localtime') >= ?"
    params.push(options.startDate)
  }
  
  if (options?.endDate) {
    sql += " AND date(t.created_at, 'localtime') <= ?"
    params.push(options.endDate)
  }
  
  sql += ' ORDER BY t.created_at DESC LIMIT ?'
  params.push(String(limit))
  
  const stmt = db?.prepare(sql)
  return stmt?.all(...params) || []
})

ipcMain.handle('config:get', () => {
  const config = loadConfig()
  return {
    dataDir: getDataDir(),
    customDataDir: config.dataDir || null
  }
})

ipcMain.handle('config:setDataDir', (_event, dataDir: string | null) => {
  try {
    const config = loadConfig()
    
    if (dataDir) {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }
      config.dataDir = dataDir
    } else {
      delete config.dataDir
    }
    
    const saved = saveConfig(config)
    return { success: saved }
  } catch (error) {
    logger.error('Failed to set data directory:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to set data directory' }
  }
})

ipcMain.handle('dialog:openDirectory', async () => {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择数据存储目录'
  })
  
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: null }
  }
  
  return { canceled: false, filePath: result.filePaths[0] }
})

ipcMain.handle('window:focus', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
    mainWindow.webContents.focus()
  }
  return true
})

ipcMain.handle('dialog:confirm', async (_event, message: string) => {
  const { dialog } = await import('electron')
  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'question',
    buttons: ['取消', '确定'],
    defaultId: 1,
    cancelId: 0,
    message: message
  })
  return result.response === 1
})

ipcMain.handle('llm:getConfig', () => {
  const config = loadConfig()
  return {
    apiKey: config.llm?.apiKey || null,
    baseUrl: config.llm?.baseUrl || null,
    model: config.llm?.model || null,
    timeout: config.llm?.timeout || 30,
    verifySSL: config.llm?.verifySSL !== false,
    promptTemplate: config.llm?.promptTemplate || null
  }
})

ipcMain.handle('llm:setConfig', (_event, llmConfig: { apiKey?: string; baseUrl?: string; model?: string; timeout?: number; verifySSL?: boolean; promptTemplate?: string }) => {
  try {
    const config = loadConfig()
    config.llm = {
      ...config.llm,
      ...llmConfig
    }
    const saved = saveConfig(config)
    return { success: saved }
  } catch (error) {
    logger.error('Failed to set LLM config:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to set LLM config' }
  }
})

ipcMain.handle('llm:generateSummary', async (_event, request: SummaryRequest) => {
  try {
    const config = loadConfig()
    
    if (!config.llm?.apiKey || !config.llm?.baseUrl) {
      return { 
        success: false, 
        error: '请先配置 LLM API Key 和 Base URL' 
      }
    }

    const summary = await generateSummary(
      {
        apiKey: config.llm.apiKey,
        baseUrl: config.llm.baseUrl,
        model: config.llm.model,
        timeout: config.llm.timeout,
        verifySSL: config.llm.verifySSL,
        promptTemplate: config.llm.promptTemplate,
      },
      request
    )
    
    return { success: true, summary }
  } catch (error) {
    logger.error('Failed to generate summary:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to generate summary' 
    }
  }
})

ipcMain.handle('file:save', async (_event, options: { defaultPath: string; filters: { name: string; extensions: string[] }[]; content: string }) => {
  const { dialog } = await import('electron')
  
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: options.defaultPath,
    filters: options.filters,
    title: '保存文件'
  })
  
  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true }
  }
  
  try {
    fs.writeFileSync(result.filePath, options.content, 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (error) {
    logger.error('Failed to save file:', error)
    return { success: false, error: error instanceof Error ? error.message : '保存文件失败' }
  }
})

ipcMain.handle('file:saveBinary', async (_event, options: { defaultPath: string; filters: { name: string; extensions: string[] }[]; content: number[] }) => {
  const { dialog } = await import('electron')
  
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: options.defaultPath,
    filters: options.filters,
    title: '保存文件'
  })
  
  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true }
  }
  
  try {
    const buffer = Buffer.from(options.content)
    fs.writeFileSync(result.filePath, buffer)
    return { success: true, filePath: result.filePath }
  } catch (error) {
    logger.error('Failed to save binary file:', error)
    return { success: false, error: error instanceof Error ? error.message : '保存文件失败' }
  }
})

ipcMain.handle('clipboard:writeImage', (_event, imageData: string) => {
  try {
    const image = nativeImage.createFromDataURL(imageData)
    
    if (image.isEmpty()) {
      return { success: false, error: '无法创建图片' }
    }
    
    clipboard.writeImage(image)
    return { success: true }
  } catch (error) {
    logger.error('Failed to write image to clipboard:', error)
    return { success: false, error: error instanceof Error ? error.message : '复制图片失败' }
  }
})

ipcMain.handle('clipboard:readImage', async () => {
  try {
    const image = clipboard.readImage()
    
    if (image.isEmpty()) {
      return { image: null, error: '剪贴板中没有图片' }
    }
    
    const dataUrl = image.toDataURL()
    return { image: dataUrl }
  } catch (error) {
    logger.error('Failed to read image from clipboard:', error)
    return { image: null, error: error instanceof Error ? error.message : '读取图片失败' }
  }
})

ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:checkForUpdates', async () => {
  if (isDev) {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: '检查更新',
      message: '开发模式下无法检查更新',
      buttons: ['确定']
    })
    return { success: false, error: '开发模式下无法检查更新' }
  }
  
  manualUpdateCheck = true
  try {
    await autoUpdater.checkForUpdates()
    return { success: true }
  } catch (error) {
    manualUpdateCheck = false
    return { success: false, error: error instanceof Error ? error.message : '检查更新失败' }
  }
})

ipcMain.handle('ocr:getTaskImageInfo', (_event, taskId: number) => {
  try {
    const stmt = db?.prepare('SELECT * FROM image_texts WHERE task_id = ?')
    return stmt?.all(taskId) || []
  } catch (error) {
    logger.error('Failed to get task image OCR info:', error)
    return []
  }
})

ipcMain.handle('ocr:getLogs', (_event, limit?: number) => {
  try {
    const logLimit = limit || 100
    const stmt = db?.prepare('SELECT * FROM ocr_logs ORDER BY timestamp DESC LIMIT ?')
    return stmt?.all(logLimit) || []
  } catch (error) {
    logger.error('Failed to get OCR logs:', error)
    return []
  }
})

ipcMain.handle('ocr:retry', async (_event, taskId: number, imagePath: string) => {
  try {
    const imagesDir = getImagesDir()
    const fullPath = path.join(imagesDir, imagePath)
    
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'Image file not found' }
    }
    
    const ocrResult = await extractText(fullPath, mainWindow)
    
    db?.prepare('INSERT INTO ocr_logs (task_id, image_path, status, message, error) VALUES (?, ?, ?, ?, ?)').run(
      taskId,
      imagePath,
      ocrResult.success ? 'success' : 'failed',
      ocrResult.success ? `重新识别完成，文字长度: ${ocrResult.text.length}` : null,
      ocrResult.error || null
    )
    
    const existingRecord = db?.prepare('SELECT id FROM image_texts WHERE task_id = ? AND image_path = ?').get(taskId, imagePath)
    
    if (existingRecord) {
      db?.prepare('UPDATE image_texts SET text_content = ?, ocr_status = ?, ocr_error = ?, ocr_timestamp = ? WHERE task_id = ? AND image_path = ?').run(
        ocrResult.text,
        ocrResult.success ? 'success' : 'failed',
        ocrResult.error || null,
        ocrResult.timestamp,
        taskId,
        imagePath
      )
    } else {
      db?.prepare('INSERT INTO image_texts (task_id, image_path, text_content, ocr_status, ocr_error, ocr_timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
        taskId,
        imagePath,
        ocrResult.text,
        ocrResult.success ? 'success' : 'failed',
        ocrResult.error || null,
        ocrResult.timestamp
      )
    }
    
    return { success: true }
  } catch (error) {
    logger.error('Failed to retry OCR:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to retry OCR' }
  }
})

ipcMain.handle('log:openFolder', () => {
  const logDir = path.join(app.getPath('userData'), 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  shell.openPath(logDir)
  return { success: true }
})
