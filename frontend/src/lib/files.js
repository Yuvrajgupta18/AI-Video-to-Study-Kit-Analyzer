export const SUPPORTED_EXTENSIONS = ['.mp4', '.mp3', '.wav', '.m4a']
export const MAX_FILE_SIZE_MB = 500

export const ACCEPT_ATTRIBUTE = [
  ...SUPPORTED_EXTENSIONS,
  'video/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
].join(',')

export function getExtension(fileName = '') {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase()
}

export function isVideoFile(fileName) {
  return getExtension(fileName) === '.mp4'
}

/** Returns an error message, or null when the file can be uploaded. */
export function validateFile(file) {
  if (!SUPPORTED_EXTENSIONS.includes(getExtension(file.name))) {
    return `"${file.name}" isn't supported. Please upload an MP4, MP3, WAV, or M4A file.`
  }
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `This file is larger than ${MAX_FILE_SIZE_MB} MB. Try a shorter recording or compress it first.`
  }
  return null
}

export function stripExtension(fileName = '') {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}
