import fs from 'fs'
import path from 'path'

export type ImagePathResult = { success: true; fullPath: string } | { success: false; error: string }

export function extractLocalImagePaths(text?: string | null): string[] {
  if (!text) {
    return []
  }

  return [...text.matchAll(/!\[.*?\]\(([^)]+)\)/g)]
    .map(match => match[1])
    .filter(Boolean)
    .map(imagePath => imagePath.startsWith('local://') ? imagePath.replace('local://', '') : imagePath)
}

export function ensureImagesDir(dataDir: string): string {
  const imagesDir = path.join(dataDir, 'images')

  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }

  return imagesDir
}

export function resolveImageFilePath(imagesDir: string, imagePath: string): ImagePathResult {
  if (!imagePath || typeof imagePath !== 'string') {
    return { success: false, error: 'Invalid image path' }
  }

  if (path.isAbsolute(imagePath)) {
    return { success: false, error: 'Absolute image paths are not allowed' }
  }

  const resolvedImagesDir = path.resolve(imagesDir)
  const fullPath = path.resolve(resolvedImagesDir, imagePath)
  const relativePath = path.relative(resolvedImagesDir, fullPath)

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return { success: false, error: 'Image path is outside the images directory' }
  }

  return { success: true, fullPath }
}

export function loadImageAsDataUrl(imagesDir: string, imagePath: string): { success: boolean; data?: string; error?: string } {
  const resolvedPath = resolveImageFilePath(imagesDir, imagePath)
  if (!resolvedPath.success) {
    return { success: false, error: resolvedPath.error }
  }

  if (!fs.existsSync(resolvedPath.fullPath)) {
    return { success: false, error: 'Image not found' }
  }

  const buffer = fs.readFileSync(resolvedPath.fullPath)
  const base64 = buffer.toString('base64')
  const ext = path.extname(imagePath).toLowerCase()
  const mimeType = ext === '.png'
    ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.gif'
        ? 'image/gif'
        : 'image/png'

  return { success: true, data: `data:${mimeType};base64,${base64}` }
}
