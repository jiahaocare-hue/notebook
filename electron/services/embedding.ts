import { logger } from './logger'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

let embedder: ((text: string, options?: { pooling?: string; normalize?: boolean }) => Promise<unknown>) | null = null

let embedderLoading: Promise<void> | null = null

const MODEL_NAME = 'BAAI-bge-small-zh-v1d5'

function getLocalModelPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'models', MODEL_NAME)
  } else {
    return path.join(__dirname, '../../resources/models', MODEL_NAME)
  }
}

async function getEmbedder() {
  if (!embedder) {
    if (!embedderLoading) {
      embedderLoading = (async () => {
        logger.info('[Embedding] Loading embedding model...')
        try {
          const localModelPath = getLocalModelPath()
          logger.info('[Embedding] Local model path:', localModelPath)
          
          const modelDirExists = fs.existsSync(localModelPath)
          logger.info('[Embedding] Model directory exists:', modelDirExists)
          
          if (modelDirExists) {
            const files = fs.readdirSync(localModelPath)
            logger.info('[Embedding] Model directory files:', files.join(', '))
          }
          
          const transformers = await (eval('import("@xenova/transformers")') as Promise<typeof import('@xenova/transformers')>)
          
          transformers.env.allowLocalModels = true
          transformers.env.useBrowserCache = false
          transformers.env.localModelPath = localModelPath
          ;(transformers.env as any).localModelOnly = true
          logger.info('[Embedding] Transformers env configured, localModelPath:', transformers.env.localModelPath)
          
          const pipeline = transformers.pipeline
          embedder = await pipeline('feature-extraction', localModelPath, {
            progress_callback: (progress: { status: string }) => {
              logger.info('[Embedding] Model loading progress:', progress.status)
            },
            local_files_only: true,
          }) as any
          logger.info('[Embedding] Model loaded successfully')
        } catch (error) {
          logger.error('[Embedding] Failed to load model:', error)
          throw error
        }
      })()
    }
    await embedderLoading
  }
  return embedder
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    logger.info('[Embedding] Generating embedding for text length:', text.length)
    const extractor = await getEmbedder()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = await (extractor as any)(text, { pooling: 'mean', normalize: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tensor = output as any
    const embedding = Array.from(tensor.data as Float32Array)
    logger.info('[Embedding] Generated embedding, dimension:', embedding.length)
    return embedding
  } catch (error) {
    logger.error('[Embedding] Failed to generate embedding:', error)
    throw error
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
