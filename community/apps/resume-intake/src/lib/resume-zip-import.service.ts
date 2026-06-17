import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { Repository } from 'typeorm'
import { RESUME_INTAKE_CONFIG } from './constants.js'
import { ResumeIntakePluginConfig } from './resume-intake.config.js'
import { groupResumeArchiveEntries, normalizeArchiveEntryName } from './resume-file-grouping.js'
import { CandidateProfile, ResumeImportBatch, ResumeSourceDocument } from './entities/index.js'
import type { ImportedResumeDocumentSummary, ResumePluginScope, ResumeUploadedFile } from './types.js'

interface FlattenedArchiveEntry {
  relativePath: string
  data: Buffer
}

export interface ResumeImportResult {
  batch: ResumeImportBatch
  candidates: CandidateProfile[]
  documents: ImportedResumeDocumentSummary[]
}

@Injectable()
export class ResumeZipImportService {
  constructor(
    @InjectRepository(ResumeImportBatch)
    private readonly batchRepo: Repository<ResumeImportBatch>,
    @InjectRepository(CandidateProfile)
    private readonly candidateRepo: Repository<CandidateProfile>,
    @InjectRepository(ResumeSourceDocument)
    private readonly documentRepo: Repository<ResumeSourceDocument>,
    @Optional()
    @Inject(RESUME_INTAKE_CONFIG)
    private readonly config?: ResumeIntakePluginConfig
  ) {}

  async importZip(file: ResumeUploadedFile, scope: ResumePluginScope): Promise<ResumeImportResult> {
    this.assertZipFile(file)

    const entries = flattenArchiveEntries(file.buffer)
    const normalizedEntryNames = entries.map((entry) => entry.relativePath)
    const maxFileCount = this.config?.maxFileCount ?? 500
    if (entries.length > maxFileCount) {
      throw new Error(`ZIP contains ${entries.length} files, exceeds configured limit ${maxFileCount}`)
    }

    const totalUncompressedSize = entries.reduce((sum, entry) => sum + entry.data.length, 0)
    const maxUncompressedBytes = (this.config?.maxUncompressedSizeMb ?? 1000) * 1024 * 1024
    if (totalUncompressedSize > maxUncompressedBytes) {
      throw new Error(`ZIP uncompressed size exceeds configured limit ${this.config?.maxUncompressedSizeMb ?? 1000} MB`)
    }

    this.assertAllowedExtensions(normalizedEntryNames)

    const grouped = groupResumeArchiveEntries(normalizedEntryNames)
    const batch = await this.batchRepo.save(
      this.batchRepo.create({
        tenantId: scope.tenantId ?? null,
        organizationId: scope.organizationId ?? null,
        createdById: scope.userId ?? null,
        sourceFileName: decodeUploadedFileName(file.originalname),
        sourceFileSize: file.size ?? file.buffer.length,
        status: 'uploaded',
        candidateCount: grouped.length,
        documentCount: entries.length
      })
    )

    const candidates = await this.candidateRepo.save(
      grouped.map((candidate) =>
        this.candidateRepo.create({
          tenantId: scope.tenantId ?? null,
          organizationId: scope.organizationId ?? null,
          batchId: batch.id,
          candidateKey: candidate.candidateKey,
          displayName: candidate.candidateKey,
          status: 'pending'
        })
      )
    )
    const candidateIdByKey = new Map(candidates.map((candidate) => [candidate.candidateKey, candidate.id]))
    const entryDataByName = new Map(entries.map((entry) => [entry.relativePath, entry.data]))
    const documentsToSave: ResumeSourceDocument[] = []

    for (const candidate of grouped) {
      for (const fileItem of candidate.files) {
        const data = entryDataByName.get(fileItem.relativePath)
        if (!data) {
          continue
        }
        documentsToSave.push(
          this.documentRepo.create({
            tenantId: scope.tenantId ?? null,
            organizationId: scope.organizationId ?? null,
            batchId: batch.id,
            candidateId: candidateIdByKey.get(candidate.candidateKey) ?? null,
            candidateKey: candidate.candidateKey,
            relativePath: fileItem.relativePath,
            fileName: fileItem.fileName,
            documentRole: fileItem.documentRole,
            mimeType: detectMimeType(fileItem.fileName),
            fileSize: data.length,
            contentHash: createHash('sha256').update(data).digest('hex'),
            storageKey: `${batch.id}/${fileItem.relativePath}`,
            previewUrl: toDataUrl(detectMimeType(fileItem.fileName), data),
            fileUrl: toDataUrl(detectMimeType(fileItem.fileName), data)
          })
        )
      }
    }

    const savedDocuments = await this.documentRepo.save(documentsToSave)

    return {
      batch,
      candidates,
      documents: savedDocuments.map((document) => ({
        id: document.id,
        candidateKey: document.candidateKey,
        relativePath: document.relativePath,
        fileName: document.fileName,
        documentRole: document.documentRole,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        contentHash: document.contentHash,
        fileUrl: document.fileUrl,
        previewUrl: document.previewUrl
      }))
    }
  }

  private assertZipFile(file: ResumeUploadedFile) {
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new Error('Uploaded ZIP file is empty')
    }
    const maxZipBytes = (this.config?.maxZipSizeMb ?? 200) * 1024 * 1024
    if (file.buffer.length > maxZipBytes) {
      throw new Error(`ZIP file exceeds configured limit ${this.config?.maxZipSizeMb ?? 200} MB`)
    }
  }

  private assertAllowedExtensions(entryNames: string[]) {
    const allowed = new Set((this.config?.allowedExtensions ?? ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png']).map((item) => item.toLowerCase()))
    const blocked = entryNames.filter((entryName) => !allowed.has(extname(entryName).toLowerCase()))
    if (blocked.length) {
      throw new Error(`Unsupported files in ZIP: ${blocked.slice(0, 5).join(', ')}`)
    }
  }
}

function flattenArchiveEntries(buffer: Buffer, prefix = '', depth = 0): FlattenedArchiveEntry[] {
  if (depth > 5) {
    throw new Error('Nested ZIP depth exceeds configured safety limit')
  }

  const zip = new AdmZip(buffer)
  const files: FlattenedArchiveEntry[] = []

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue
    }

    const entryName = decodeArchiveEntryName(entry)
    const relativePath = normalizeArchiveEntryName(prefix ? `${prefix}/${entryName}` : entryName)
    const data = entry.getData()
    if (extname(relativePath).toLowerCase() === '.zip') {
      files.push(...flattenArchiveEntries(data, stripZipExtension(relativePath), depth + 1))
      continue
    }

    files.push({
      relativePath,
      data
    })
  }

  return files
}

function stripZipExtension(relativePath: string) {
  return relativePath.replace(/\.zip$/i, '')
}

function decodeArchiveEntryName(entry: { entryName: string; rawEntryName?: Buffer }) {
  if (!entry.entryName.includes('\uFFFD') || !entry.rawEntryName?.length) {
    return entry.entryName
  }

  const decoded = new TextDecoder('gb18030').decode(entry.rawEntryName)
  return decoded.includes('\uFFFD') ? entry.entryName : decoded
}

function decodeUploadedFileName(fileName?: string) {
  const fallback = 'resume-intake.zip'
  const original = fileName?.trim() || fallback
  const decoded = Buffer.from(original, 'latin1').toString('utf8')
  return isBetterDecodedFileName(original, decoded) ? decoded : original
}

function isBetterDecodedFileName(original: string, decoded: string) {
  if (!decoded || decoded.includes('\uFFFD')) {
    return false
  }
  return filenameScore(decoded) > filenameScore(original)
}

function filenameScore(value: string) {
  let score = 0
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 0x4e00 && code <= 0x9fff) score += 3
    if (code >= 0x20 && code < 0x7f) score += 1
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) score -= 3
    if ('ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßáàâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ'.includes(char)) {
      score -= 1
    }
  }
  return score
}

function detectMimeType(fileName: string) {
  const extension = extname(fileName).toLowerCase()
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.doc') return 'application/msword'
  if (extension === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.png') return 'image/png'
  return 'application/octet-stream'
}

function toDataUrl(mimeType: string, data: Buffer) {
  return `data:${mimeType};base64,${data.toString('base64')}`
}
