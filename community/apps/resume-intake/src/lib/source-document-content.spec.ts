import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { extractSourceDocumentContent } from './source-document-content.js'

void main()

async function main() {
  const docxText = '张三 13800138000 zhangsan@example.com 本科'
  const docxResult = await extractSourceDocumentContent({
    fileName: '张三简历.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: 1024,
    fileUrl: toDataUrl(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      createDocx(docxText)
    )
  })

  assert.equal(docxResult.extractionStatus, 'text_extracted')
  assert(docxResult.extractedText?.includes('13800138000'), 'DOCX text should include phone number')
  assert.equal('dataUrl' in docxResult, false, 'text extraction result must not echo base64 data URLs')

  const imageResult = await extractSourceDocumentContent({
    fileName: '证件照.jpg',
    mimeType: 'image/jpeg',
    fileSize: 3,
    fileUrl: 'data:image/jpeg;base64,/9j/'
  })

  assert.equal(imageResult.extractionStatus, 'visual_content')
  assert.equal(imageResult.imageAvailable, true)
  assert.equal(imageResult.dataUrl, 'data:image/jpeg;base64,/9j/')

  const unsupportedResult = await extractSourceDocumentContent({
    fileName: '旧版简历.doc',
    mimeType: 'application/msword',
    fileSize: 12,
    fileUrl: toDataUrl('application/msword', Buffer.from('legacy doc'))
  })

  assert.equal(unsupportedResult.extractionStatus, 'unsupported')
  assert.equal('dataUrl' in unsupportedResult, false, 'unsupported binary result must not echo base64 data URLs')

  console.log('source-document-content.spec.ts passed')
}

function toDataUrl(mimeType: string, data: Buffer) {
  return `data:${mimeType};base64,${data.toString('base64')}`
}

function createDocx(text: string) {
  const zip = new AdmZip()
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>'
    )
  )
  zip.addFile(
    '_rels/.rels',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>'
    )
  )
  zip.addFile(
    'word/document.xml',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body><w:p><w:r><w:t>' +
        escapeXml(text) +
        '</w:t></w:r></w:p></w:body></w:document>'
    )
  )
  return zip.toBuffer()
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
