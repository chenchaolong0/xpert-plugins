import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CandidateFieldEvidence,
  CandidateProfile,
  ResumeCandidateReparseJob,
  ResumeImportBatch,
  ResumeSourceDocument
} from './entities/index.js'
import type {
  BatchCandidateReparseChatMessage,
  CandidateReparseChatMessage,
  CandidateReviewStatus,
  ImportBatchReparseChatMessage,
  ResumeCandidateReparseJobStatus,
  ResumePluginScope,
  SaveCandidateProfileInput
} from './types.js'
import { buildSourceDocumentChatFiles } from './source-document-attachments.js'

@Injectable()
export class CandidateProfileService {
  constructor(
    @InjectRepository(ResumeImportBatch)
    private readonly batchRepo: Repository<ResumeImportBatch>,
    @InjectRepository(CandidateProfile)
    private readonly candidateRepo: Repository<CandidateProfile>,
    @InjectRepository(ResumeSourceDocument)
    private readonly documentRepo: Repository<ResumeSourceDocument>,
    @InjectRepository(CandidateFieldEvidence)
    private readonly evidenceRepo: Repository<CandidateFieldEvidence>,
    @InjectRepository(ResumeCandidateReparseJob)
    private readonly reparseJobRepo: Repository<ResumeCandidateReparseJob>
  ) {}

  listBatches(scope: ResumePluginScope, limit = 50) {
    return this.batchRepo.find({
      where: this.scopeWhere(scope),
      order: { createdAt: 'DESC' },
      take: limit
    })
  }

  listCandidates(scope: ResumePluginScope, batchId?: string, limit = 200) {
    return this.candidateRepo.find({
      where: batchId ? { ...this.scopeWhere(scope), batchId } : this.scopeWhere(scope),
      order: { createdAt: 'DESC' },
      take: limit
    })
  }

  listCandidateDocuments(scope: ResumePluginScope, batchId: string, candidateKey?: string) {
    return this.documentRepo.find({
      where: candidateKey
        ? { ...this.scopeWhere(scope), batchId, candidateKey }
        : { ...this.scopeWhere(scope), batchId },
      order: { relativePath: 'ASC' }
    })
  }

  listCandidateEvidence(scope: ResumePluginScope, candidateId: string) {
    return this.evidenceRepo.find({
      where: {
        ...this.scopeWhere(scope),
        candidateId
      },
      order: { createdAt: 'DESC' }
    })
  }

  listReparseJobs(scope: ResumePluginScope, candidateId?: string, limit = 50) {
    return this.reparseJobRepo.find({
      where: candidateId ? { ...this.scopeWhere(scope), candidateId } : this.scopeWhere(scope),
      order: { createdAt: 'DESC' },
      take: limit
    })
  }

  async saveCandidateProfile(input: SaveCandidateProfileInput, scope: ResumePluginScope) {
    const candidate =
      (await this.candidateRepo.findOne({
        where: {
          ...this.scopeWhere(scope),
          batchId: input.batchId,
          candidateKey: input.candidateKey
        }
      })) ??
      this.candidateRepo.create({
        ...this.scopeWhere(scope),
        batchId: input.batchId,
        candidateKey: input.candidateKey
      })

    candidate.displayName = input.profile.name ?? candidate.displayName ?? input.candidateKey
    candidate.status = 'parsed'
    candidate.profile = input.profile
    candidate.confidence = input.confidence ?? null
    candidate.parseError = null

    const savedCandidate = await this.candidateRepo.save(candidate)
    await this.evidenceRepo.delete({ candidateId: savedCandidate.id })

    const evidence = (input.evidence ?? []).map((item) =>
      this.evidenceRepo.create({
        ...this.scopeWhere(scope),
        batchId: input.batchId,
        candidateId: savedCandidate.id,
        field: item.field,
        value: item.value ?? null,
        documentName: item.documentName ?? null,
        page: item.page ?? null,
        evidenceText: item.evidenceText,
        confidence: item.confidence ?? null
      })
    )
    if (evidence.length) {
      await this.evidenceRepo.save(evidence)
    }

    return savedCandidate
  }

  async markCandidateFailure(scope: ResumePluginScope, batchId: string, candidateKey: string, errorMessage: string) {
    const candidate = await this.findCandidate(scope, batchId, candidateKey)
    candidate.status = 'failed'
    candidate.parseError = errorMessage
    return this.candidateRepo.save(candidate)
  }

  async updateCandidateStatus(scope: ResumePluginScope, candidateId: string, status: CandidateReviewStatus) {
    const candidate = await this.candidateRepo.findOne({
      where: {
        ...this.scopeWhere(scope),
        id: candidateId
      }
    })
    if (!candidate) {
      throw new Error(`Candidate not found: ${candidateId}`)
    }
    candidate.status = status
    return this.candidateRepo.save(candidate)
  }

  async findSourceDocument(scope: ResumePluginScope, documentId: string) {
    const document = await this.documentRepo.findOne({
      where: {
        ...this.scopeWhere(scope),
        id: documentId
      }
    })
    if (!document) {
      throw new Error(`Source document not found: ${documentId}`)
    }
    return document
  }

  async prepareCandidateReparseChatMessage(
    scope: ResumePluginScope,
    candidateId: string,
    promptOverride?: string
  ): Promise<CandidateReparseChatMessage> {
    const candidate = await this.findCandidateById(scope, candidateId)
    const documents = await this.listCandidateDocuments(scope, candidate.batchId, candidate.candidateKey)
    return this.prepareCandidateScopedReparseChatMessage(scope, candidate, documents, {
      promptOverride,
      reparseScope: 'single_candidate'
    })
  }

  async prepareImportBatchReparseChatMessage(
    scope: ResumePluginScope,
    batchId: string,
    promptOverride?: string
  ): Promise<ImportBatchReparseChatMessage> {
    const batch = await this.findBatch(scope, batchId)
    const documents = await this.listCandidateDocuments(scope, batch.id)
    const candidateKeys = Array.from(new Set(documents.map((document) => document.candidateKey))).sort()
    const fileList = documents
      .map((document) => `- ${document.candidateKey}: ${document.fileName} (${document.documentRole}, ${document.relativePath})`)
      .join('\n')
    const input =
      promptOverride ??
      [
        `请重新解析导入批次「${batch.sourceFileName}」。`,
        `导入批次 ID: ${batch.id}`,
        `候选人数量: ${candidateKeys.length || batch.candidateCount}`,
        '这是唯一一条批次识别消息，请在本消息内处理全部候选人，不要等待后续消息，也不要只处理最后一个候选人。',
        '请先调用 resume_list_import_batch_candidates 获取候选人和材料清单。',
        '随消息附上的 PDF 页面 PNG 图片是扫描版 PDF 的可视化页面，请优先从这些图片识别内容。',
        '如果 PDF 文本为空或乱码，请以附件图片、原始 PDF/Word/图片文件和可用文件解析能力为准。',
        '请逐个候选人读取材料，调用 resume_save_candidate_profile 覆盖保存结构化信息和证据。',
        '无法可靠识别的候选人请调用 resume_report_candidate_parse_failure。',
        '全部处理完成后请调用 resume_finalize_import_batch。',
        '来源材料:',
        fileList || '- 暂无来源材料'
      ].join('\n')

    const files = await buildSourceDocumentChatFiles(documents.map((document) => ({
      id: document.id,
      candidateKey: document.candidateKey,
      relativePath: document.relativePath,
      fileName: document.fileName,
      documentRole: document.documentRole,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      contentHash: document.contentHash,
      fileAssetId: document.fileAssetId,
      storageFileId: document.storageFileId,
      fileUrl: document.fileUrl,
      previewUrl: document.previewUrl
    })))

    return {
      commandKey: 'assistant.chat.send_message',
      input,
      files,
      context: {
        source: 'resume-intake',
        batchId: batch.id,
        reparseScope: 'batch'
      }
    }
  }

  async prepareImportBatchCandidateReparseChatMessages(
    scope: ResumePluginScope,
    batchId: string,
    promptOverride?: string
  ): Promise<BatchCandidateReparseChatMessage[]> {
    const batch = await this.findBatch(scope, batchId)
    const [candidates, documents] = await Promise.all([
      this.listCandidates(scope, batch.id, 1000),
      this.listCandidateDocuments(scope, batch.id)
    ])
    const documentsByCandidateKey = new Map<string, ResumeSourceDocument[]>()
    for (const document of documents) {
      const group = documentsByCandidateKey.get(document.candidateKey) ?? []
      group.push(document)
      documentsByCandidateKey.set(document.candidateKey, group)
    }

    const messages: BatchCandidateReparseChatMessage[] = []
    for (const candidate of candidates) {
      const candidateDocuments = documentsByCandidateKey.get(candidate.candidateKey) ?? []
      const message = await this.prepareCandidateScopedReparseChatMessage(scope, candidate, candidateDocuments, {
        promptOverride,
        reparseScope: 'batch_candidate',
        batchSourceFileName: batch.sourceFileName
      })
      messages.push({
        commandKey: message.commandKey,
        input: message.input,
        files: message.files,
        context: {
          source: message.context.source,
          batchId: message.context.batchId,
          candidateId: message.context.candidateId,
          candidateKey: message.context.candidateKey,
          reparseJobId: message.context.reparseJobId,
          reparseScope: 'batch_candidate'
        }
      })
    }
    return messages
  }

  async markReparseJob(
    scope: ResumePluginScope,
    input: {
      reparseJobId: string
      status: ResumeCandidateReparseJobStatus
      taskId?: string
      executionId?: string
      conversationId?: string
      threadId?: string
      clientMessageId?: string
      errorMessage?: string
    }
  ) {
    const job = await this.reparseJobRepo.findOne({
      where: {
        ...this.scopeWhere(scope),
        id: input.reparseJobId
      }
    })
    if (!job) {
      throw new Error(`Reparse job not found: ${input.reparseJobId}`)
    }
    job.status = input.status
    job.taskId = input.taskId ?? job.taskId
    job.executionId = input.executionId ?? job.executionId
    job.conversationId = input.conversationId ?? job.conversationId
    job.threadId = input.threadId ?? job.threadId
    job.clientMessageId = input.clientMessageId ?? job.clientMessageId
    job.errorMessage = input.errorMessage ?? job.errorMessage
    return this.reparseJobRepo.save(job)
  }

  async finalizeBatch(scope: ResumePluginScope, batchId: string) {
    const batch = await this.findBatch(scope, batchId)
    batch.status = 'parsed'
    return this.batchRepo.save(batch)
  }

  async deleteImportBatch(scope: ResumePluginScope, batchId: string) {
    const where = {
      ...this.scopeWhere(scope),
      id: batchId
    }
    const batch = await this.batchRepo.findOne({ where })
    if (!batch) {
      throw new Error(`Import batch not found: ${batchId}`)
    }
    const batchWhere = {
      ...this.scopeWhere(scope),
      batchId
    }
    await this.evidenceRepo.delete(batchWhere)
    await this.reparseJobRepo.delete(batchWhere)
    await this.documentRepo.delete(batchWhere)
    await this.candidateRepo.delete(batchWhere)
    await this.batchRepo.delete(where)
    return batch
  }

  private async findCandidate(scope: ResumePluginScope, batchId: string, candidateKey: string) {
    const candidate = await this.candidateRepo.findOne({
      where: {
        ...this.scopeWhere(scope),
        batchId,
        candidateKey
      }
    })
    if (!candidate) {
      throw new Error(`Candidate not found: ${candidateKey}`)
    }
    return candidate
  }

  private async findBatch(scope: ResumePluginScope, batchId: string) {
    const batch = await this.batchRepo.findOne({
      where: {
        ...this.scopeWhere(scope),
        id: batchId
      }
    })
    if (!batch) {
      throw new Error(`Import batch not found: ${batchId}`)
    }
    return batch
  }

  private async findCandidateById(scope: ResumePluginScope, candidateId: string) {
    const candidate = await this.candidateRepo.findOne({
      where: {
        ...this.scopeWhere(scope),
        id: candidateId
      }
    })
    if (!candidate) {
      throw new Error(`Candidate not found: ${candidateId}`)
    }
    return candidate
  }

  private async prepareCandidateScopedReparseChatMessage(
    scope: ResumePluginScope,
    candidate: CandidateProfile,
    documents: ResumeSourceDocument[],
    options: {
      promptOverride?: string
      reparseScope: 'single_candidate' | 'batch_candidate'
      batchSourceFileName?: string
    }
  ): Promise<CandidateReparseChatMessage> {
    const job = await this.reparseJobRepo.save(
      this.reparseJobRepo.create({
        ...this.scopeWhere(scope),
        batchId: candidate.batchId,
        candidateId: candidate.id,
        candidateKey: candidate.candidateKey,
        status: 'pending',
        prompt: options.promptOverride ?? null
      })
    )
    const fileList = documents
      .map((document) => `- ${document.fileName} (${document.documentRole}, ${document.relativePath})`)
      .join('\n')
    const candidateName = candidate.displayName ?? candidate.candidateKey
    const input =
      options.promptOverride ??
      [
        `请只解析候选人「${candidateName}」的简历材料。`,
        `导入批次 ID: ${candidate.batchId}`,
        options.batchSourceFileName ? `导入包: ${options.batchSourceFileName}` : '',
        `候选人目录: ${candidate.candidateKey}`,
        '请直接使用本消息附上的 PDF、PDF 页面图片、图片、Word 或其他原始文件识别内容；这些附件就是本候选人的材料。',
        '如果 PDF 文本是空的或出现乱码，请以随消息附上的 PDF 页面 PNG 图片、图片附件或原始文件解析能力为准，不要根据乱码猜测。',
        '只保存这个候选人的结构化信息和字段证据，不要处理其他候选人。',
        '识别完成后必须调用 resume_save_candidate_profile 保存，batchId 和 candidateKey 必须使用上面的值。',
        '如果无法可靠识别，请调用 resume_report_candidate_parse_failure。',
        '如需补充读取材料，可调用 resume_read_source_document 按 documentId 读取。',
        '来源材料:',
        fileList || '- 暂无来源材料'
      ].filter((line) => line.length > 0).join('\n')

    const files = await buildSourceDocumentChatFiles(documents.map(toSourceDocumentAttachmentInput))

    return {
      commandKey: 'assistant.chat.send_message',
      input,
      files,
      context: {
        source: 'resume-intake',
        batchId: candidate.batchId,
        candidateId: candidate.id,
        candidateKey: candidate.candidateKey,
        reparseJobId: job.id,
        reparseScope: options.reparseScope
      }
    }
  }

  private scopeWhere(scope: ResumePluginScope) {
    return {
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope.organizationId ? { organizationId: scope.organizationId } : {})
    }
  }
}

function toSourceDocumentAttachmentInput(document: ResumeSourceDocument) {
  return {
    id: document.id,
    candidateKey: document.candidateKey,
    relativePath: document.relativePath,
    fileName: document.fileName,
    documentRole: document.documentRole,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    contentHash: document.contentHash,
    fileAssetId: document.fileAssetId,
    storageFileId: document.storageFileId,
    fileUrl: document.fileUrl,
    previewUrl: document.previewUrl
  }
}
