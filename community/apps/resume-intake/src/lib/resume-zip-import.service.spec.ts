import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { CandidateProfile, ResumeImportBatch, ResumeSourceDocument } from './entities/index.js'
import { ResumeZipImportService } from './resume-zip-import.service.js'

class BatchRepo {
  items: ResumeImportBatch[] = []

  create(input: Partial<ResumeImportBatch>) {
    return Object.assign(new ResumeImportBatch(), input)
  }

  async save(batch: ResumeImportBatch) {
    batch.id = `batch-${this.items.length + 1}`
    this.items.push(batch)
    return batch
  }
}

class CandidateRepo {
  items: CandidateProfile[] = []

  create(input: Partial<CandidateProfile>) {
    return Object.assign(new CandidateProfile(), input)
  }

  async save(candidates: CandidateProfile[]) {
    const saved = candidates.map((candidate, index) => {
      candidate.id = `candidate-${this.items.length + index + 1}`
      return candidate
    })
    this.items.push(...saved)
    return saved
  }
}

class DocumentRepo {
  items: ResumeSourceDocument[] = []

  create(input: Partial<ResumeSourceDocument>) {
    return Object.assign(new ResumeSourceDocument(), input)
  }

  async save(documents: ResumeSourceDocument[]) {
    const saved = documents.map((document, index) => {
      document.id = `document-${this.items.length + index + 1}`
      return document
    })
    this.items.push(...saved)
    return saved
  }
}

const innerZip = new AdmZip()
innerZip.addFile('刘培星简历.pdf', Buffer.from('%PDF-1.4\nresume'))
innerZip.addFile('就业推荐表.jpg', Buffer.from([0xff, 0xd8, 0xff]))

const outerZip = new AdmZip()
outerZip.addFile('刘培星/1775812925895就业推荐表等文件.zip', innerZip.toBuffer())

const batchRepo = new BatchRepo()
const candidateRepo = new CandidateRepo()
const documentRepo = new DocumentRepo()
const service = new ResumeZipImportService(batchRepo as never, candidateRepo as never, documentRepo as never)

void main()

async function main() {
  const result = await service.importZip(
    {
      buffer: outerZip.toBuffer(),
      originalname: Buffer.from('简历包.zip', 'utf8').toString('latin1'),
      mimetype: 'application/zip'
    },
    {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    }
  )

  assert.equal(result.batch.id, 'batch-1')
  assert.equal(result.batch.sourceFileName, '简历包.zip')
  assert.equal(result.batch.candidateCount, 1)
  assert.equal(result.batch.documentCount, 2)
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].candidateKey, '刘培星')
  assert.deepEqual(
    result.documents.map((document) => document.fileName).sort(),
    ['刘培星简历.pdf', '就业推荐表.jpg']
  )
  assert(
    result.documents.every((document) => document.relativePath.startsWith('刘培星/1775812925895就业推荐表等文件/')),
    'nested ZIP documents should keep a stable parent path prefix'
  )

  const gbkResult = await service.importZip(
    {
      buffer: createGbkEncodedZip(),
      originalname: 'gbk.zip',
      mimetype: 'application/zip'
    },
    {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    }
  )

  assert.equal(gbkResult.candidates[0].candidateKey, '岳心语')
  assert.equal(gbkResult.documents[0].candidateKey, '岳心语')
  assert.equal(gbkResult.documents[0].relativePath, '岳心语/岳心语的简历.pdf')
  assert.equal(gbkResult.documents[0].fileName, '岳心语的简历.pdf')

  console.log('resume-zip-import.service.spec.ts passed')
}

function createGbkEncodedZip() {
  const gbkDecoder = {
    efs: false,
    encode(value: string) {
      if (value === '岳心语/岳心语的简历.pdf') {
        return Buffer.from('d4c0d0c4d3ef2fd4c0d0c4d3efb5c4bcf2c0fa2e706466', 'hex')
      }
      return Buffer.from(value, 'utf8')
    },
    decode(value: Buffer) {
      return value.toString('binary')
    }
  }
  const zip = new AdmZip({ decoder: gbkDecoder })
  zip.addFile('岳心语/岳心语的简历.pdf', Buffer.from('%PDF-1.4\nresume'))
  return zip.toBuffer()
}
