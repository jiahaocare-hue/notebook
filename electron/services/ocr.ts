import Tesseract from 'tesseract.js'
import path from 'path'
import fs from 'fs'

export async function extractText(imagePath: string): Promise<string> {
  try {
    const absolutePath = path.isAbsolute(imagePath) 
      ? imagePath 
      : path.join(process.cwd(), imagePath)
    
    if (!fs.existsSync(absolutePath)) {
      console.error('Image file not found:', absolutePath)
      return ''
    }

    console.log('Starting OCR for:', absolutePath)
    
    const result = await Tesseract.recognize(absolutePath, 'chi_sim+eng', {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`)
        }
      }
    })

    console.log('OCR completed for:', absolutePath)
    return result.data.text.trim()
  } catch (error) {
    console.error('OCR failed:', error)
    return ''
  }
}
