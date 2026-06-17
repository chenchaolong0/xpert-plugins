import { createRequire } from 'node:module'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResumeDocumentRole } from './resume-file-grouping.js'
import type { CandidateReparseChatFile, ImportedResumeDocumentSummary } from './types.js'

interface SourceDocumentAttachmentInput extends ImportedResumeDocumentSummary {
  fileAssetId?: string | null
  storageFileId?: string | null
}

interface BuildSourceDocumentChatFilesOptions {
  pdfPageLimit?: number
  maxRenderedPdfDocuments?: number
}

interface PdfToImgModule {
  pdf(input: string | Buffer, options?: { scale?: number }): Promise<{
    length: number
    getPage(pageNumber: number): Promise<Buffer>
    destroy(): Promise<void>
  }>
}

const optionalRequire = createRequire(`${process.cwd()}/package.json`)
const DEFAULT_PDF_PAGE_LIMIT = 2
const DEFAULT_MAX_RENDERED_PDF_DOCUMENTS = 12

export async function buildSourceDocumentChatFiles(
  documents: SourceDocumentAttachmentInput[],
  options: BuildSourceDocumentChatFilesOptions = {}
): Promise<CandidateReparseChatFile[]> {
  const renderedFiles: CandidateReparseChatFile[] = []
  const sourceFiles = documents.map(toSourceDocumentChatFile)
  const pdfPageLimit = options.pdfPageLimit ?? DEFAULT_PDF_PAGE_LIMIT
  const maxRenderedPdfDocuments = options.maxRenderedPdfDocuments ?? DEFAULT_MAX_RENDERED_PDF_DOCUMENTS
  let renderedPdfDocuments = 0

  for (const document of documents) {
    if (renderedPdfDocuments >= maxRenderedPdfDocuments) {
      break
    }
    if (!isPdf(document.mimeType, document.fileName) || !document.fileUrl) {
      continue
    }
    const pages = await renderPdfPageFiles(document, pdfPageLimit)
    if (pages.length) {
      renderedPdfDocuments += 1
      renderedFiles.push(...pages)
    }
  }

  return [...renderedFiles, ...sourceFiles]
}

function toSourceDocumentChatFile(document: SourceDocumentAttachmentInput): CandidateReparseChatFile {
  return {
    id: document.id,
    name: document.fileName,
    originalName: document.fileName,
    mimeType: document.mimeType,
    mimetype: document.mimeType,
    size: document.fileSize,
    documentRole: document.documentRole,
    candidateKey: document.candidateKey,
    fileAssetId: document.fileAssetId,
    storageFileId: document.storageFileId,
    fileUrl: document.fileUrl,
    previewUrl: document.previewUrl,
    attachmentKind: 'source_document',
    sourceDocumentId: document.id
  }
}

async function renderPdfPageFiles(
  document: SourceDocumentAttachmentInput,
  pageLimit: number
): Promise<CandidateReparseChatFile[]> {
  try {
    const pdfToImg = await loadPdfToImg()
    const pdfDocument = await pdfToImg.pdf(document.fileUrl ?? '', { scale: 2 })
    try {
      const pageCount = Math.min(pdfDocument.length, pageLimit)
      const pages: CandidateReparseChatFile[] = []
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const image = await pdfDocument.getPage(pageNumber)
        pages.push({
          id: `${document.id}:page:${pageNumber}`,
          name: `${document.fileName} 第${pageNumber}页.png`,
          originalName: `${document.fileName} 第${pageNumber}页.png`,
          mimeType: 'image/png',
          mimetype: 'image/png',
          size: image.length,
          documentRole: document.documentRole,
          candidateKey: document.candidateKey,
          fileUrl: `data:image/png;base64,${image.toString('base64')}`,
          previewUrl: `data:image/png;base64,${image.toString('base64')}`,
          attachmentKind: 'rendered_pdf_page',
          sourceDocumentId: document.id,
          pageNumber
        })
      }
      return pages
    } finally {
      await pdfDocument.destroy()
    }
  } catch {
    return []
  }
}

async function loadPdfToImg() {
  const resolved = optionalRequire.resolve('pdf-to-img')
  const imported = (await import(pathToFileURL(resolved).href)) as unknown
  if (isPdfToImgModule(imported)) {
    return imported
  }
  throw new Error('pdf-to-img module is unavailable.')
}

function isPdfToImgModule(value: unknown): value is PdfToImgModule {
  return typeof value === 'object' && value !== null && 'pdf' in value && typeof value.pdf === 'function'
}

function isPdf(mimeType: string | null | undefined, fileName: string) {
  return mimeType === 'application/pdf' || extname(fileName).toLowerCase() === '.pdf'
}
