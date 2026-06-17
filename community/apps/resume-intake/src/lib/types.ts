import type { ResumeDocumentRole } from './resume-file-grouping.js'

export type ResumeImportStatus = 'uploaded' | 'extracting' | 'parsed' | 'reviewing' | 'approved' | 'failed'
export type CandidateReviewStatus = 'pending' | 'parsed' | 'approved' | 'rejected' | 'failed'
export type ResumeCandidateReparseJobStatus = 'pending' | 'dispatched' | 'running' | 'succeeded' | 'failed'

export interface ResumePluginScope {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
}

export interface ResumeUploadedFile {
  buffer: Buffer
  originalname?: string
  mimetype?: string
  size?: number
}

export interface CandidateProfilePayload {
  name?: string
  phone?: string
  email?: string
  targetPosition?: string
  highestDegree?: string
  school?: string
  major?: string
  yearsOfExperience?: number
  skills?: string[]
  certificates?: string[]
  workExperiences?: unknown[]
  educationExperiences?: unknown[]
  raw?: unknown
}

export interface CandidateFieldEvidencePayload {
  field: string
  value?: string
  documentName?: string
  page?: number
  evidenceText: string
  confidence?: number
}

export interface SaveCandidateProfileInput {
  batchId: string
  candidateKey: string
  profile: CandidateProfilePayload
  confidence?: number
  evidence?: CandidateFieldEvidencePayload[]
}

export interface ImportedResumeDocumentSummary {
  id: string
  candidateKey: string
  relativePath: string
  fileName: string
  documentRole: ResumeDocumentRole
  mimeType?: string | null
  fileSize: number
  contentHash: string
  fileUrl?: string | null
  previewUrl?: string | null
}

export interface CandidateReparseChatMessage {
  commandKey: 'assistant.chat.send_message'
  input: string
  files?: CandidateReparseChatFile[]
  context: {
    source: 'resume-intake'
    batchId: string
    candidateId: string
    candidateKey: string
    reparseJobId: string
    reparseScope?: 'single_candidate' | 'batch_candidate'
  }
}

export interface BatchCandidateReparseChatMessage {
  commandKey: 'assistant.chat.send_message'
  input: string
  files?: CandidateReparseChatFile[]
  context: {
    source: 'resume-intake'
    batchId: string
    candidateId: string
    candidateKey: string
    reparseJobId: string
    reparseScope: 'batch_candidate'
  }
}

export interface ImportBatchReparseChatMessage {
  commandKey: 'assistant.chat.send_message'
  input: string
  files?: CandidateReparseChatFile[]
  context: {
    source: 'resume-intake'
    batchId: string
    reparseScope: 'batch'
  }
}

export interface CandidateReparseChatFile {
  id: string
  name: string
  originalName: string
  mimeType?: string | null
  mimetype?: string | null
  size: number
  documentRole: ResumeDocumentRole
  fileAssetId?: string | null
  storageFileId?: string | null
  fileUrl?: string | null
  previewUrl?: string | null
  attachmentKind?: 'source_document' | 'rendered_pdf_page'
  sourceDocumentId?: string
  pageNumber?: number
  candidateKey?: string
}
