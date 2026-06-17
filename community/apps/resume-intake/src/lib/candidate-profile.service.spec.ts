import assert from 'node:assert/strict'
import {
  CandidateFieldEvidence,
  CandidateProfile,
  ResumeCandidateReparseJob,
  ResumeImportBatch,
  ResumeSourceDocument
} from './entities/index.js'
import { CandidateProfileService } from './candidate-profile.service.js'

class Repo<T extends { id?: string }> {
  items: T[] = []
  deletes: Array<Partial<T>> = []
  private sequence = 0

  constructor(private readonly prefix: string) {}

  create(input: Partial<T>) {
    return input as T
  }

  async save(input: T | T[]) {
    if (Array.isArray(input)) {
      for (const item of input) {
        this.assignId(item)
        this.items.push(item)
      }
      return input
    }
    this.assignId(input)
    this.items.push(input)
    return input
  }

  async find(query: { where?: Partial<T> }) {
    return this.items.filter((item) => matchesWhere(item, query.where))
  }

  async findOne(query: { where?: Partial<T> }) {
    return this.items.find((item) => matchesWhere(item, query.where)) ?? null
  }

  async delete(where: Partial<T>) {
    this.deletes.push(where)
    const before = this.items.length
    this.items = this.items.filter((item) => !matchesWhere(item, where))
    return { affected: before - this.items.length }
  }

  private assignId(item: T) {
    if (!item.id) {
      this.sequence += 1
      item.id = `${this.prefix}-${this.sequence}`
    }
  }
}

const batchRepo = new Repo<ResumeImportBatch>('batch')
const candidateRepo = new Repo<CandidateProfile>('candidate')
const documentRepo = new Repo<ResumeSourceDocument>('document')
const evidenceRepo = new Repo<CandidateFieldEvidence>('evidence')
const reparseJobRepo = new Repo<ResumeCandidateReparseJob>('job')

const candidate = Object.assign(new CandidateProfile(), {
  id: 'candidate-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  batchId: 'batch-1',
  candidateKey: '张三',
  displayName: '张三',
  status: 'pending'
})
candidateRepo.items.push(candidate)
candidateRepo.items.push(Object.assign(new CandidateProfile(), {
  id: 'candidate-2',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  batchId: 'batch-1',
  candidateKey: '李四',
  displayName: '李四',
  status: 'pending'
}))
batchRepo.items.push(
  Object.assign(new ResumeImportBatch(), {
    id: 'batch-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    sourceFileName: '简历包.zip',
    sourceFileSize: 100,
    status: 'uploaded',
    candidateCount: 2,
    documentCount: 2
  })
)

documentRepo.items.push(
  Object.assign(new ResumeSourceDocument(), {
    id: 'document-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    batchId: 'batch-1',
    candidateId: 'candidate-1',
    candidateKey: '张三',
    relativePath: '张三/张三简历.pdf',
    fileName: '张三简历.pdf',
    documentRole: 'resume',
    mimeType: 'application/pdf',
    fileSize: 123,
    contentHash: 'hash-1',
    fileUrl: 'data:application/pdf;base64,JVBERi0=',
    previewUrl: 'data:application/pdf;base64,JVBERi0='
  }),
  Object.assign(new ResumeSourceDocument(), {
    id: 'document-2',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    batchId: 'batch-1',
    candidateId: 'candidate-2',
    candidateKey: '李四',
    relativePath: '李四/李四证书.png',
    fileName: '李四证书.png',
    documentRole: 'certificate',
    mimeType: 'image/png',
    fileSize: 456,
    contentHash: 'hash-2',
    fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
    previewUrl: 'data:image/png;base64,iVBORw0KGgo='
  })
)
evidenceRepo.items.push(
  Object.assign(new CandidateFieldEvidence(), {
    id: 'evidence-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    batchId: 'batch-1',
    candidateId: 'candidate-1',
    field: 'phone',
    evidenceText: '13800138000'
  })
)
reparseJobRepo.items.push(
  Object.assign(new ResumeCandidateReparseJob(), {
    id: 'job-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    batchId: 'batch-1',
    candidateId: 'candidate-1',
    candidateKey: '张三',
    status: 'pending'
  })
)

const service = new CandidateProfileService(
  batchRepo as never,
  candidateRepo as never,
  documentRepo as never,
  evidenceRepo as never,
  reparseJobRepo as never
)

void service
  .prepareCandidateReparseChatMessage({
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1'
  }, 'candidate-1')
  .then((message) => {
    assert.equal(message.files?.length, 1)
    assert.equal(message.files?.[0].id, 'document-1')
    assert.equal(message.files?.[0].name, '张三简历.pdf')
    assert.equal(message.files?.[0].mimeType, 'application/pdf')
    assert.equal(message.files?.[0].fileUrl, 'data:application/pdf;base64,JVBERi0=')
    return service.prepareImportBatchReparseChatMessage({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    }, 'batch-1')
  })
  .then((message) => {
    assert.equal(message.commandKey, 'assistant.chat.send_message')
    assert.equal(message.context.batchId, 'batch-1')
    assert.equal(message.context.reparseScope, 'batch')
    assert(message.input.includes('请重新解析导入批次'))
    assert(message.input.includes('这是唯一一条批次识别消息'))
    assert.equal(message.files?.length, 2)
    return service.prepareImportBatchCandidateReparseChatMessages({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    }, 'batch-1')
  })
  .then((messages) => {
    assert.equal(messages.length, 2)
    assert.deepEqual(messages.map((message) => message.context.candidateKey), ['张三', '李四'])
    assert(messages[0].input.includes('只解析候选人「张三」'))
    assert(messages[1].input.includes('只解析候选人「李四」'))
    assert.equal(messages[0].files?.length, 1)
    assert.equal(messages[0].files?.[0].candidateKey, '张三')
    assert.equal(messages[1].files?.length, 1)
    assert.equal(messages[1].files?.[0].candidateKey, '李四')
    assert.equal(messages[1].files?.[0].id, 'document-2')
    assert.equal(messages[0].context.reparseScope, 'batch_candidate')
    assert.equal(messages[1].context.reparseScope, 'batch_candidate')
    return service.deleteImportBatch({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    }, 'batch-1')
  })
  .then((deletedBatch) => {
    assert.equal(deletedBatch.id, 'batch-1')
    assert.equal(batchRepo.items.length, 0)
    assert.equal(candidateRepo.items.length, 0)
    assert.equal(documentRepo.items.length, 0)
    assert.equal(evidenceRepo.items.length, 0)
    assert.equal(reparseJobRepo.items.length, 0)
    assert.deepEqual(batchRepo.deletes[0], {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      id: 'batch-1'
    })
    assert.deepEqual(candidateRepo.deletes[0], {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      batchId: 'batch-1'
    })
    console.log('candidate-profile.service.spec.ts passed')
  })

function matchesWhere<T>(item: T, where?: Partial<T>) {
  if (!where) return true
  return Object.entries(where).every(([key, expected]) => item[key as keyof T] === expected)
}
