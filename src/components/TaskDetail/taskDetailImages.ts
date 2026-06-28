import type { ImageOCRInfo, Task } from '../../types'
import { imageApi, ocrApi } from '../../ipc/tasks'

export function insertImageIntoDescription(
  currentDescription: string | null,
  imageFileName: string,
  savedPath: string
): string {
  const imageRef = `![${imageFileName}](local://${savedPath})`
  const textOnlyDescription = currentDescription?.replace(/!\[.*?\]\(.*?\)/g, '').trim() || ''

  if (textOnlyDescription) {
    return `${textOnlyDescription}\n\n${imageRef}`
  }

  return imageRef
}

export async function saveAndInsertImage(
  imageData: string,
  fileName: string,
  task: Task,
  onUpdate: (task: Task) => void
): Promise<boolean> {
  try {
    const savedPath = await imageApi.save(imageData, fileName, task.id)
    if (savedPath) {
      const updatedDescription = insertImageIntoDescription(task.description, fileName, savedPath)
      onUpdate({ ...task, description: updatedDescription })
      return true
    }
    return false
  } catch (error) {
    console.error('Failed to insert image:', error)
    return false
  }
}

export async function retryOcrAndLoadInfo(taskId: number, imagePath: string): Promise<{
  ocrMap: Map<string, ImageOCRInfo>
  error?: string
}> {
  const result = await ocrApi.retry(taskId, imagePath)
  const ocrData = await ocrApi.getTaskImageInfo(taskId)
  const ocrMap = new Map<string, ImageOCRInfo>()
  ocrData.forEach(info => ocrMap.set(info.image_path, info))

  return {
    ocrMap,
    error: result.success ? undefined : result.error || 'OCR retry failed',
  }
}
