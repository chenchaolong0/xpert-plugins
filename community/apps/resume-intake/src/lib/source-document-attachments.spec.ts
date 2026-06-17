import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSourceDocumentChatFiles } from './source-document-attachments.js'

const requireFromHere = createRequire(`${process.cwd()}/package.json`)

void main()

async function main() {
  const pdfBuffer = await createPdf('Resume phone 13800138000 email zhangsan@example.com')
  const files = await buildSourceDocumentChatFiles(
    [
      {
        id: 'document-1',
        candidateKey: '张三',
        fileName: '张三简历.pdf',
        relativePath: '张三/张三简历.pdf',
        documentRole: 'resume',
        mimeType: 'application/pdf',
        fileSize: pdfBuffer.length,
        contentHash: 'hash-1',
        fileUrl: toDataUrl('application/pdf', pdfBuffer),
        previewUrl: toDataUrl('application/pdf', pdfBuffer)
      }
    ],
    {
      pdfPageLimit: 1,
      maxRenderedPdfDocuments: 1
    }
  )

  assert.equal(files.length, 2)
  assert.equal(files[0].attachmentKind, 'rendered_pdf_page')
  assert.equal(files[0].sourceDocumentId, 'document-1')
  assert.equal(files[0].candidateKey, '张三')
  assert.equal(files[0].pageNumber, 1)
  assert.equal(files[0].mimeType, 'image/png')
  assert(files[0].fileUrl?.startsWith('data:image/png;base64,'), 'rendered PDF page should be an image data URL')
  assert.equal(files[1].attachmentKind, 'source_document')
  assert.equal(files[1].candidateKey, '张三')
  assert.equal(files[1].mimeType, 'application/pdf')

  console.log('source-document-attachments.spec.ts passed')
}

function toDataUrl(mimeType: string, data: Buffer) {
  return `data:${mimeType};base64,${data.toString('base64')}`
}

function createPdf(text: string) {
  const PDFDocument = requireFromHere('@foliojs-fork/pdfkit')
  const document = new PDFDocument({ size: 'A4', margin: 48 })
  const chunks: Buffer[] = []
  document.on('data', (chunk: Buffer) => chunks.push(chunk))
  const finished = new Promise<Buffer>((resolve) => {
    document.on('end', () => resolve(Buffer.concat(chunks)))
  })
  document.fontSize(18).text(text)
  document.end()
  return finished
}
