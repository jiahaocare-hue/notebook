const fs = require('fs')
const os = require('os')
const path = require('path')
const Database = require('better-sqlite3')

const rootDir = path.resolve(__dirname, '..')
const dbPath = path.join(rootDir, 'data', 'tasks.db')
const imageDir = path.join(rootDir, 'data', 'images')
const resourceDir = path.join(rootDir, 'resources')
const packagedResourceDir = path.join(rootDir, 'release', 'win-unpacked', 'resources', 'resources')

const results = []

function record(status, name, detail = '') {
  results.push({ status, name, detail })
}

function pass(name, detail) {
  record('PASS', name, detail)
}

function warn(name, detail) {
  record('WARN', name, detail)
}

function skip(name, detail) {
  record('SKIP', name, detail)
}

function fail(name, detail) {
  record('FAIL', name, detail)
}

function tableExists(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  return Boolean(row)
}

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

function recordMigration(db, id, description) {
  const existing = db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(id)
  if (!existing) {
    db.prepare('INSERT INTO schema_migrations (id, description) VALUES (?, ?)').run(id, description)
  }
}

function runMigrationSimulation() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-manager-regression-'))
  const tempDbPath = path.join(tempDir, 'tasks.db')

  try {
    fs.copyFileSync(dbPath, tempDbPath)
    const tempDb = new Database(tempDbPath)

    try {
      tempDb.exec('PRAGMA foreign_keys = OFF')
      ensureMigrationTable(tempDb)
      recordMigration(tempDb, '001_core_task_tables', 'Record core task, history, embedding, and image table baseline')
      recordMigration(tempDb, '002_image_texts_fk_shape', 'Record image_texts foreign key shape baseline')
      recordMigration(tempDb, '003_ocr_logs_table', 'Record OCR logs table baseline')
      recordMigration(tempDb, '004_image_texts_ocr_columns', 'Record image_texts OCR column baseline')
      recordMigration(tempDb, '005_tasks_hierarchy_columns', 'Record task hierarchy column baseline')
      recordMigration(tempDb, '006_common_indexes', 'Record common index baseline')
      tempDb.exec('PRAGMA foreign_keys = ON')

      const migrationCount = tempDb.prepare('SELECT COUNT(*) as count FROM schema_migrations').get().count
      const integrity = tempDb.pragma('integrity_check', { simple: true })
      const foreignKeyRows = tempDb.pragma('foreign_key_check')

      if (migrationCount >= 6 && integrity === 'ok' && foreignKeyRows.length === 0) {
        pass('旧库迁移模拟可补齐 schema_migrations', `${migrationCount} records, integrity ${integrity}, fk ${foreignKeyRows.length}`)
      } else {
        fail('旧库迁移模拟可补齐 schema_migrations', `${migrationCount} records, integrity ${integrity}, fk ${foreignKeyRows.length}`)
      }
    } finally {
      tempDb.close()
    }
  } finally {
    const resolvedTempDir = path.resolve(tempDir)
    if (resolvedTempDir.startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(resolvedTempDir, { recursive: true, force: true })
    }
  }
}

function firstExistingFile(paths) {
  return paths.find(filePath => fs.existsSync(filePath))
}

function assertResourceFile(relativePath) {
  const sourcePath = path.join(resourceDir, relativePath)
  const packagedPath = path.join(packagedResourceDir, relativePath)

  if (!fs.existsSync(sourcePath)) {
    fail(`资源文件存在：resources/${relativePath}`, '源资源缺失')
    return
  }

  if (fs.existsSync(path.join(rootDir, 'release', 'win-unpacked')) && !fs.existsSync(packagedPath)) {
    fail(`打包资源存在：resources/${relativePath}`, 'release/win-unpacked 中缺失')
    return
  }

  pass(`资源文件存在：resources/${relativePath}`)
}

function run() {
  if (!fs.existsSync(dbPath)) {
    fail('数据库文件存在', dbPath)
    return
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const integrity = db.pragma('integrity_check', { simple: true })
    if (integrity === 'ok') {
      pass('SQLite integrity_check', 'ok')
    } else {
      fail('SQLite integrity_check', String(integrity))
    }

    const foreignKeyRows = db.pragma('foreign_key_check')
    if (foreignKeyRows.length === 0) {
      pass('SQLite foreign_key_check', '0 rows')
    } else {
      fail('SQLite foreign_key_check', `${foreignKeyRows.length} rows`)
    }

    const requiredTables = ['tasks', 'task_history', 'task_embeddings', 'image_texts', 'ocr_logs']
    for (const table of requiredTables) {
      if (tableExists(db, table)) {
        pass(`核心表存在：${table}`)
      } else {
        fail(`核心表存在：${table}`, 'missing')
      }
    }

    if (tableExists(db, 'schema_migrations')) {
      const migrationCount = db.prepare('SELECT COUNT(*) as count FROM schema_migrations').get().count
      if (migrationCount > 0) {
        pass('schema_migrations baseline', `${migrationCount} records`)
      } else {
        fail('schema_migrations baseline', '0 records')
      }
    } else {
      warn('schema_migrations baseline', '当前 data/tasks.db 尚未经过新版应用初始化，改用临时副本做迁移模拟')
    }

    runMigrationSimulation()

    const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count
    pass('任务表可读', `${taskCount} tasks`)

    const topLevelTasks = db.prepare('SELECT * FROM tasks WHERE parent_id IS NULL ORDER BY created_at DESC LIMIT 20').all()
    pass('顶层任务列表查询可读', `${topLevelTasks.length} rows`)

    const historyCount = db.prepare('SELECT COUNT(*) as count FROM task_history').get().count
    pass('历史记录表可读', `${historyCount} rows`)

    const sampleTask = db.prepare("SELECT * FROM tasks WHERE title IS NOT NULL AND length(title) >= 3 ORDER BY created_at DESC LIMIT 1").get()
    if (sampleTask) {
      const keywordRows = db.prepare(`
        SELECT DISTINCT t.id
        FROM tasks t
        LEFT JOIN task_history h ON t.id = h.task_id
        WHERE t.title LIKE ? OR t.description LIKE ? OR h.old_value LIKE ? OR h.new_value LIKE ?
        LIMIT 500
      `).all(`%${sampleTask.title}%`, `%${sampleTask.title}%`, `%${sampleTask.title}%`, `%${sampleTask.title}%`)
      if (keywordRows.some(row => row.id === sampleTask.id)) {
        pass('关键词搜索可找到标题匹配任务', `task_id=${sampleTask.id}`)
      } else {
        fail('关键词搜索可找到标题匹配任务', `未找到 task_id=${sampleTask.id}`)
      }
    } else {
      skip('关键词搜索可找到标题匹配任务', '没有可用任务样本')
    }

    const sampleHistory = db.prepare(`
      SELECT h.task_id, COALESCE(h.new_value, h.old_value) as payload
      FROM task_history h
      WHERE COALESCE(h.new_value, h.old_value) IS NOT NULL
        AND COALESCE(h.new_value, h.old_value) != ''
      ORDER BY h.timestamp DESC
      LIMIT 1
    `).get()
    if (sampleHistory) {
      const rows = db.prepare(`
        SELECT DISTINCT t.id
        FROM tasks t
        LEFT JOIN task_history h ON t.id = h.task_id
        WHERE h.old_value LIKE ? OR h.new_value LIKE ?
        LIMIT 50
      `).all(`%${sampleHistory.payload}%`, `%${sampleHistory.payload}%`)
      if (rows.some(row => row.id === sampleHistory.task_id)) {
        pass('关键词搜索可找到历史内容匹配任务', `task_id=${sampleHistory.task_id}`)
      } else {
        fail('关键词搜索可找到历史内容匹配任务', `未找到 task_id=${sampleHistory.task_id}`)
      }
    } else {
      skip('关键词搜索可找到历史内容匹配任务', '没有历史内容样本')
    }

    const imageTextCount = db.prepare('SELECT COUNT(*) as count FROM image_texts').get().count
    pass('OCR 图片文本表可读', `${imageTextCount} rows`)

    const sampleImageText = db.prepare(`
      SELECT task_id, image_path, text_content
      FROM image_texts
      WHERE task_id IS NOT NULL
        AND text_content IS NOT NULL
        AND text_content != ''
      ORDER BY created_at DESC
      LIMIT 1
    `).get()
    if (sampleImageText) {
      const imageRows = db.prepare(`
        SELECT DISTINCT t.id
        FROM tasks t
        INNER JOIN image_texts it ON t.id = it.task_id
        WHERE it.text_content LIKE ?
        LIMIT 50
      `).all(`%${sampleImageText.text_content}%`)
      if (imageRows.some(row => row.id === sampleImageText.task_id)) {
        pass('图片搜索可找到 OCR 文本匹配任务', `task_id=${sampleImageText.task_id}`)
      } else {
        fail('图片搜索可找到 OCR 文本匹配任务', `未找到 task_id=${sampleImageText.task_id}`)
      }

      const imagePath = path.resolve(imageDir, sampleImageText.image_path)
      const relative = path.relative(path.resolve(imageDir), imagePath)
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(imagePath)) {
        pass('OCR 样本图片文件存在', sampleImageText.image_path)
      } else {
        warn('OCR 样本图片文件存在', `${sampleImageText.image_path} 不存在或越界`)
      }
    } else {
      skip('图片搜索可找到 OCR 文本匹配任务', '没有已识别 OCR 文本样本')
    }

    const summaryStatusRows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks
      WHERE parent_id IS NULL
      GROUP BY status
    `).all()
    const summaryPriorityRows = db.prepare(`
      SELECT priority, COUNT(*) as count
      FROM tasks
      WHERE parent_id IS NULL
      GROUP BY priority
    `).all()
    pass('Summary 聚合查询可读', `${summaryStatusRows.length} status groups, ${summaryPriorityRows.length} priority groups`)

    const ocrLogCount = db.prepare('SELECT COUNT(*) as count FROM ocr_logs').get().count
    pass('OCR 日志表可读', `${ocrLogCount} rows`)

    assertResourceFile(path.join('tessdata', 'chi_sim.traineddata'))
    assertResourceFile(path.join('tessdata', 'eng.traineddata'))
    assertResourceFile(path.join('models', 'BAAI-bge-small-zh-v1d5', 'onnx', 'model_quantized.onnx'))

    const packagedExe = firstExistingFile([
      path.join(rootDir, 'release', 'win-unpacked', 'Task Manager.exe'),
      path.join(rootDir, 'release', 'win-unpacked', 'task-manager.exe'),
    ])
    if (packagedExe) {
      pass('打包产物 exe 存在', path.relative(rootDir, packagedExe))
    } else {
      warn('打包产物 exe 存在', '未找到 release/win-unpacked exe，跳过打包产物启动验证')
    }
  } finally {
    db.close()
  }
}

try {
  run()
} catch (error) {
  fail('回归脚本执行', error instanceof Error ? error.message : String(error))
}

const statusOrder = { FAIL: 0, WARN: 1, SKIP: 2, PASS: 3 }
for (const result of results.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])) {
  const detail = result.detail ? ` - ${result.detail}` : ''
  console.log(`[${result.status}] ${result.name}${detail}`)
}

const failures = results.filter(result => result.status === 'FAIL')
const warnings = results.filter(result => result.status === 'WARN')
const skips = results.filter(result => result.status === 'SKIP')

console.log('')
console.log(`Summary: ${results.length - failures.length - warnings.length - skips.length} passed, ${warnings.length} warnings, ${skips.length} skipped, ${failures.length} failed`)

if (failures.length > 0) {
  process.exit(1)
}
