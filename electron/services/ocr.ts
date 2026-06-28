import Tesseract from 'tesseract.js'
import path from 'path'
import fs from 'fs'
import { app, BrowserWindow } from 'electron'
import https from 'https'
import http from 'http'

const MODEL_FILES = [
  { name: 'chi_sim.traineddata', url: 'https://github.com/tesseract-ocr/tessdata/raw/main/chi_sim.traineddata' },
  { name: 'eng.traineddata', url: 'https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata' }
]

export interface OCRResult {
  success: boolean
  text: string
  error?: string
  timestamp: string
}

type OCRWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>

let workerPromise: Promise<OCRWorker> | null = null
let recognitionQueue: Promise<OCRResult> = Promise.resolve({
  success: true,
  text: '',
  timestamp: new Date().toISOString(),
})
let activeProgressWindow: BrowserWindow | null = null
let workerCleanupRegistered = false

function getTessDataPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'tessdata')
  }

  const candidates = [
    path.join(app.getAppPath(), 'resources', 'tessdata'),
    path.join(process.cwd(), 'resources', 'tessdata'),
    path.join(__dirname, '../../resources/tessdata'),
  ]

  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0]
}

function sendProgress(window: BrowserWindow | null, status: string, progress: number, message: string) {
  if (window && !window.isDestroyed()) {
    try {
      window.webContents.send('ocr:download-progress', { status, progress, message })
    } catch (e) {
      console.error('Failed to send OCR progress:', e)
    }
  }
}

async function downloadFile(url: string, destPath: string, window: BrowserWindow | null, fileName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    
    const file = fs.createWriteStream(destPath)
    
    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          file.close()
          fs.unlinkSync(destPath)
          downloadFile(redirectUrl, destPath, window, fileName).then(resolve).catch(reject)
          return
        }
      }
      
      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloadedSize = 0
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length
        const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
        sendProgress(window, 'downloading', progress, `正在下载 ${fileName}: ${progress}%`)
      })
      
      response.pipe(file)
      
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      fs.unlink(destPath, () => {})
      reject(err)
    })
  })
}

async function ensureModelsExist(window: BrowserWindow | null): Promise<string> {
  const tessDataPath = getTessDataPath()
  
  if (!fs.existsSync(tessDataPath)) {
    fs.mkdirSync(tessDataPath, { recursive: true })
  }
  
  const missingModels = MODEL_FILES.filter(model => 
    !fs.existsSync(path.join(tessDataPath, model.name))
  )
  
  if (missingModels.length === 0) {
    return tessDataPath
  }
  
  sendProgress(window, 'downloading', 0, '正在准备下载 OCR 模型...')
  
  for (let i = 0; i < missingModels.length; i++) {
    const model = missingModels[i]
    const destPath = path.join(tessDataPath, model.name)
    
    try {
      sendProgress(window, 'downloading', 0, `正在下载 ${model.name} (${i + 1}/${missingModels.length})...`)
      await downloadFile(model.url, destPath, window, model.name)
      sendProgress(window, 'downloading', 100, `${model.name} 下载完成`)
    } catch (error) {
      sendProgress(window, 'error', 0, `下载 ${model.name} 失败`)
      throw error
    }
  }
  
  sendProgress(window, 'complete', 100, 'OCR 模型准备完成')
  
  return tessDataPath
}

async function getWorker(window: BrowserWindow | null): Promise<OCRWorker> {
  if (!workerPromise) {
    const tessDataPath = await ensureModelsExist(window)

    workerPromise = Tesseract.createWorker('chi_sim+eng', undefined, {
      langPath: tessDataPath,
      cachePath: tessDataPath,
      gzip: false,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          const progress = Math.round(m.progress * 100)
          sendProgress(activeProgressWindow, 'recognizing', progress, `正在识别文字: ${progress}%`)
        }
      }
    }).then(async worker => {
      await worker.load()
      if (!workerCleanupRegistered) {
        workerCleanupRegistered = true
        app.once('before-quit', () => {
          resetWorker().catch(() => {})
        })
      }
      return worker
    }).catch(error => {
      workerPromise = null
      throw error
    })
  }

  return workerPromise
}

async function resetWorker(): Promise<void> {
  const worker = await workerPromise?.catch(() => null)
  workerPromise = null
  if (worker) {
    await worker.terminate().catch(() => {})
  }
}

async function recognizeImage(imagePath: string, window: BrowserWindow | null): Promise<OCRResult> {
  const timestamp = new Date().toISOString()

  try {
    const absolutePath = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(process.cwd(), imagePath)

    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        text: '',
        error: 'Image file not found',
        timestamp
      }
    }

    let result
    try {
      activeProgressWindow = window
      const worker = await getWorker(window)
      result = await worker.recognize(absolutePath)
    } catch (tesseractError) {
      await resetWorker()
      return {
        success: false,
        text: '',
        error: `OCR worker 识别失败: ${tesseractError instanceof Error ? tesseractError.message : 'Unknown error'}`,
        timestamp
      }
    } finally {
      activeProgressWindow = null
    }

    sendProgress(window, 'complete', 100, '识别完成')
    
    return {
      success: true,
      text: result.data.text.trim(),
      timestamp
    }
  } catch (error) {
    sendProgress(window, 'error', 0, 'OCR 识别失败')
    
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp
    }
  }
}

export async function extractText(imagePath: string, window: BrowserWindow | null = null): Promise<OCRResult> {
  const run = () => recognizeImage(imagePath, window)
  recognitionQueue = recognitionQueue.then(run, run)
  return recognitionQueue
}
