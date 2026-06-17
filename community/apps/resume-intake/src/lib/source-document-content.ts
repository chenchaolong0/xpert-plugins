import { extname } from 'node:path'
import { createRequire } from 'node:module'

export type SourceDocumentExtractionStatus =
  | 'text_extracted'
  | 'empty_text'
  | 'visual_content'
  | 'unsupported'
  | 'missing_content'
  | 'failed'

export interface SourceDocumentContentInput {
  id?: string
  batchId?: string
  candidateKey?: string
  fileName: string
  relativePath?: string
  documentRole?: string
  mimeType?: string | null
  fileSize: number
  fileUrl?: string | null
  previewUrl?: string | null
}

export interface SourceDocumentContentResult {
  id?: string
  batchId?: string
  candidateKey?: string
  fileName: string
  relativePath?: string
  documentRole?: string
  mimeType?: string | null
  fileSize: number
  extractionStatus: SourceDocumentExtractionStatus
  extractedText?: string
  contentPreview?: string
  imageAvailable?: boolean
  dataUrl?: string
  errorMessage?: string
  guidance: string
}

interface PdfParseModule {
  default?: (buffer: Buffer) => Promise<{ text?: string }>
}

interface MammothModule {
  default?: {
    extractRawText(input: { buffer: Buffer }): Promise<{ value?: string }>
  }
  extractRawText?: (input: { buffer: Buffer }) => Promise<{ value?: string }>
}

const MAX_EXTRACTED_TEXT_LENGTH = 24000
const MAX_PREVIEW_LENGTH = 1200
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024
const optionalRequire = createRequire(`${process.cwd()}/package.json`)

export async function extractSourceDocumentContent(
  document: SourceDocumentContentInput
): Promise<SourceDocumentContentResult> {
  const dataUrl = document.fileUrl ?? document.previewUrl
  const base = {
    id: document.id,
    batchId: document.batchId,
    candidateKey: document.candidateKey,
    fileName: document.fileName,
    relativePath: document.relativePath,
    documentRole: document.documentRole,
    mimeType: document.mimeType,
    fileSize: document.fileSize
  }

  if (!dataUrl) {
    return {
      ...base,
      extractionStatus: 'missing_content',
      guidance: 'Source file content is unavailable. Report failure instead of guessing from file names.'
    }
  }

  const parsed = parseDataUrl(dataUrl)
  if (!parsed) {
    return {
      ...base,
      extractionStatus: 'missing_content',
      guidance: 'Source file content is not a readable data URL. Report failure instead of guessing from file names.'
    }
  }

  if (isImage(document.mimeType, document.fileName)) {
    const canInline = parsed.buffer.length <= MAX_INLINE_IMAGE_BYTES
    return {
      ...base,
      extractionStatus: 'visual_content',
      imageAvailable: true,
      ...(canInline ? { dataUrl } : {}),
      guidance: canInline
        ? 'This image data URL is available for visual inspection.'
        : 'Image is too large to inline from the tool output. Use a reparse message with the source file attached.'
    }
  }

  if (isPdf(document.mimeType, document.fileName)) {
    return extractTextWithFallback(base, () => extractPdfText(parsed.buffer))
  }

  if (isDocx(document.mimeType, document.fileName)) {
    return extractTextWithFallback(base, () => extractDocxText(parsed.buffer))
  }

  if (isPlainText(document.mimeType, document.fileName)) {
    return textResult(base, parsed.buffer.toString('utf8'))
  }

  return {
    ...base,
    extractionStatus: 'unsupported',
    guidance:
      'This binary source type cannot be converted to text by the tool. Use a reparse message with the file attached, or report failure if the content remains unreadable.'
  }
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) {
    return null
  }
  const isBase64 = Boolean(match[2])
  const payload = match[3] ?? ''
  return {
    mimeType: match[1] ?? null,
    buffer: isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8')
  }
}

async function extractTextWithFallback(
  base: Omit<SourceDocumentContentResult, 'extractionStatus' | 'guidance'>,
  readText: () => Promise<string>
): Promise<SourceDocumentContentResult> {
  try {
    return textResult(base, await readText())
  } catch (error) {
    return {
      ...base,
      extractionStatus: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Document text extraction failed.',
      guidance:
        'Text extraction failed for this source document. Use a reparse message with the file attached, or report failure if content is not readable.'
    }
  }
}

function textResult(
  base: Omit<SourceDocumentContentResult, 'extractionStatus' | 'guidance'>,
  text: string
): SourceDocumentContentResult {
  const normalized = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return {
      ...base,
      extractionStatus: 'empty_text',
      guidance:
        'No selectable text was extracted. This is likely a scanned PDF or image-only document. Use the rendered PDF page PNG attachments from the current assistant message for visual parsing before reporting failure.'
    }
  }

  const extractedText =
    normalized.length > MAX_EXTRACTED_TEXT_LENGTH
      ? `${normalized.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n[内容已截断]`
      : normalized
  return {
    ...base,
    extractionStatus: 'text_extracted',
    extractedText,
    contentPreview: extractedText.slice(0, MAX_PREVIEW_LENGTH),
    guidance:
      'Use extractedText as the source document content. Save only fields supported by this text or by other readable source documents.'
  }
}

async function extractPdfText(buffer: Buffer) {
  const imported = optionalRequire('pdf-parse') as unknown
  const pdfParse = readPdfParser(imported)
  const result = await pdfParse(buffer)
  return result.text ?? ''
}

async function extractDocxText(buffer: Buffer) {
  const imported = optionalRequire('mammoth') as unknown
  const mammoth = readMammoth(imported)
  const result = await mammoth.extractRawText({ buffer })
  return result.value ?? ''
}

function readPdfParser(module: unknown) {
  if (typeof module === 'function') {
    return module as (buffer: Buffer) => Promise<{ text?: string }>
  }
  if (isPdfParseModule(module) && typeof module.default === 'function') {
    return module.default
  }
  throw new Error('pdf-parse module is unavailable.')
}

function readMammoth(module: unknown) {
  if (isMammothModule(module) && typeof module.extractRawText === 'function') {
    return module
  }
  if (isMammothModule(module) && module.default && typeof module.default.extractRawText === 'function') {
    return module.default
  }
  throw new Error('mammoth module is unavailable.')
}

function isPdfParseModule(value: unknown): value is PdfParseModule {
  return typeof value === 'object' && value !== null && 'default' in value
}

function isMammothModule(value: unknown): value is MammothModule {
  return typeof value === 'object' && value !== null
}

function isPdf(mimeType: string | null | undefined, fileName: string) {
  return mimeType === 'application/pdf' || extname(fileName).toLowerCase() === '.pdf'
}

function isDocx(mimeType: string | null | undefined, fileName: string) {
  return (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extname(fileName).toLowerCase() === '.docx'
  )
}

function isImage(mimeType: string | null | undefined, fileName: string) {
  const extension = extname(fileName).toLowerCase()
  return Boolean(mimeType?.startsWith('image/')) || ['.jpg', '.jpeg', '.png'].includes(extension)
}

function isPlainText(mimeType: string | null | undefined, fileName: string) {
  return Boolean(mimeType?.startsWith('text/')) || ['.txt', '.md'].includes(extname(fileName).toLowerCase())
}
