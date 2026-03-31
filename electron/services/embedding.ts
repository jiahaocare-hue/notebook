let embedder: ((text: string, options?: { pooling?: string; normalize?: boolean }) => Promise<unknown>) | null = null

async function getEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model...')
    // Use eval to prevent TypeScript from converting import() to require()
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const transformers = await (eval('import("@xenova/transformers")') as Promise<typeof import('@xenova/transformers')>)
    
    // Allow local models cache
    transformers.env.allowLocalModels = true
    transformers.env.useBrowserCache = false
    
    // Use Hugging Face mirror for faster download in China
    // You can also set HF_ENDPOINT environment variable
    const hfEndpoint = process.env.HF_ENDPOINT || 'https://hf-mirror.com'
    transformers.env.remoteHost = hfEndpoint
    console.log('Using Hugging Face endpoint:', hfEndpoint)
    
    const pipeline = transformers.pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
      progress_callback: (progress: { status: string; loaded?: number; total?: number }) => {
        if (progress.status === 'downloading') {
          const percent = progress.total ? Math.round((progress.loaded! / progress.total!) * 100) : 0
          console.log(`Downloading model: ${percent}%`)
        } else if (progress.status === 'done') {
          console.log('Model download complete')
        }
      },
    }) as any
    console.log('Embedding model loaded')
  }
  return embedder
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const extractor = await getEmbedder()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = await (extractor as any)(text, { pooling: 'mean', normalize: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tensor = output as any
    return Array.from(tensor.data as Float32Array)
  } catch (error) {
    console.error('Failed to generate embedding:', error)
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
