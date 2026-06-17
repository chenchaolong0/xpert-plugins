import { Inject, Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  RESUME_INTAKE_FEATURE,
  RESUME_INTAKE_MIDDLEWARE_NAME,
  RESUME_INTAKE_TOOL_NAMES
} from './constants.js'
import { CandidateProfileService } from './candidate-profile.service.js'
import type { CandidateProfilePayload, ResumePluginScope } from './types.js'
import { extractSourceDocumentContent } from './source-document-content.js'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

const evidenceSchema = z.object({
  field: z.string().min(1).describe('Profile field name that this evidence supports.'),
  value: z.string().optional().describe('Extracted value supported by this evidence.'),
  documentName: z.string().optional().describe('Source resume or proof document file name.'),
  page: z.number().int().positive().optional().describe('Source document page number if available.'),
  evidenceText: z.string().min(1).describe('Short verbatim evidence text from the source document.'),
  confidence: z.number().min(0).max(1).optional().describe('Confidence score for this field evidence.')
})

const candidateProfileSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  targetPosition: z.string().optional(),
  highestDegree: z.string().optional(),
  school: z.string().optional(),
  major: z.string().optional(),
  yearsOfExperience: z.number().min(0).optional(),
  skills: z.array(z.string()).optional(),
  certificates: z.array(z.string()).optional(),
  workExperiences: z.array(z.unknown()).optional(),
  educationExperiences: z.array(z.unknown()).optional(),
  raw: z.unknown().optional()
})

const saveCandidateProfileSchema = z.object({
  batchId: z.string().min(1).describe('Resume import batch id.'),
  candidateKey: z.string().min(1).describe('Candidate folder key, for example 张三 or 李四.'),
  profile: candidateProfileSchema,
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.array(evidenceSchema).default([])
})

const listCandidatesSchema = z.object({
  batchId: z.string().min(1).describe('Resume import batch id.')
})

const readSourceDocumentSchema = z.object({
  documentId: z.string().min(1).describe('Source document id from resume_list_import_batch_candidates.')
})

const reportFailureSchema = z.object({
  batchId: z.string().min(1),
  candidateKey: z.string().min(1),
  errorMessage: z.string().min(1)
})

const finalizeBatchSchema = z.object({
  batchId: z.string().min(1)
})

@Injectable()
@AgentMiddlewareStrategy(RESUME_INTAKE_MIDDLEWARE_NAME)
export class ResumeIntakeMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(
    @Inject(CandidateProfileService)
    private readonly candidateService: CandidateProfileService
  ) {}

  readonly meta: TAgentMiddlewareMeta = {
    name: RESUME_INTAKE_MIDDLEWARE_NAME,
    label: text('Resume Intake', '简历包识别'),
    description: text(
      'Extract candidate profiles from imported resume ZIP batches and save structured profile fields with evidence.',
      '从已导入的简历 ZIP 批次中提取候选人信息，并保存带证据的结构化字段。'
    ),
    features: [RESUME_INTAKE_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope = scopeFromAgentContext(context)

    const listCandidatesTool = tool(
      async (input: z.infer<typeof listCandidatesSchema>) => {
        const candidates = await this.candidateService.listCandidates(scope, input.batchId)
        const documents = await this.candidateService.listCandidateDocuments(scope, input.batchId)
        return JSON.stringify({
          message: 'Candidates and source documents are ready for resume extraction.',
          batchId: input.batchId,
          candidates: candidates.map((candidate) => ({
            id: candidate.id,
            candidateKey: candidate.candidateKey,
            status: candidate.status,
            displayName: candidate.displayName,
            documents: documents
              .filter((document) => document.candidateKey === candidate.candidateKey)
              .map((document) => ({
                id: document.id,
                fileName: document.fileName,
                relativePath: document.relativePath,
                documentRole: document.documentRole,
                mimeType: document.mimeType,
                fileSize: document.fileSize
              }))
          }))
        })
      },
      {
        name: RESUME_INTAKE_TOOL_NAMES[0],
        description:
          'List candidates and their source documents for a resume import batch before extracting structured profiles.',
        schema: listCandidatesSchema
      }
    )

    const readSourceDocumentTool = tool(
      async (input: z.infer<typeof readSourceDocumentSchema>) => {
        const document = await this.candidateService.findSourceDocument(scope, input.documentId)
        const content = await extractSourceDocumentContent(document)
        return JSON.stringify(content)
      },
      {
        name: RESUME_INTAKE_TOOL_NAMES[4],
        description:
          'Read one source document from an imported resume batch by document id. Returns metadata and extracted text when possible; avoids dumping binary base64 for PDFs/DOCX.',
        schema: readSourceDocumentSchema
      }
    )

    const saveProfileTool = tool(
      async (input: z.infer<typeof saveCandidateProfileSchema>) => {
        const profile: CandidateProfilePayload = input.profile
        const candidate = await this.candidateService.saveCandidateProfile(
          {
            batchId: input.batchId,
            candidateKey: input.candidateKey,
            profile,
            confidence: input.confidence,
            evidence: input.evidence.map((item) => ({
              field: item.field ?? '',
              value: item.value,
              documentName: item.documentName,
              page: item.page,
              evidenceText: item.evidenceText ?? '',
              confidence: item.confidence
            }))
          },
          scope
        )
        return JSON.stringify({
          message: 'Candidate profile was saved for human review.',
          candidateId: candidate.id,
          batchId: candidate.batchId,
          candidateKey: candidate.candidateKey,
          status: candidate.status
        })
      },
      {
        name: RESUME_INTAKE_TOOL_NAMES[1],
        description:
          'Save exactly one candidate profile extracted from a resume package. Include field-level evidence whenever possible.',
        schema: saveCandidateProfileSchema
      }
    )

    const reportFailureTool = tool(
      async (input: z.infer<typeof reportFailureSchema>) => {
        const candidate = await this.candidateService.markCandidateFailure(
          scope,
          input.batchId,
          input.candidateKey,
          input.errorMessage
        )
        return JSON.stringify({
          message: 'Candidate extraction failure was recorded.',
          candidateId: candidate.id,
          status: candidate.status
        })
      },
      {
        name: RESUME_INTAKE_TOOL_NAMES[2],
        description:
          'Record a candidate extraction failure when the assistant cannot reliably parse the resume or proof documents.',
        schema: reportFailureSchema
      }
    )

    const finalizeBatchTool = tool(
      async (input: z.infer<typeof finalizeBatchSchema>) => {
        const batch = await this.candidateService.finalizeBatch(scope, input.batchId)
        return JSON.stringify({
          message: 'Resume import batch was finalized.',
          batchId: batch.id,
          status: batch.status
        })
      },
      {
        name: RESUME_INTAKE_TOOL_NAMES[3],
        description:
          'Finalize a resume import batch after every candidate has either been saved or reported as failed.',
        schema: finalizeBatchSchema
      }
    )

    return {
      name: RESUME_INTAKE_MIDDLEWARE_NAME,
      tools: [listCandidatesTool, readSourceDocumentTool, saveProfileTool, reportFailureTool, finalizeBatchTool]
    }
  }
}

function scopeFromAgentContext(context: IAgentMiddlewareContext): ResumePluginScope {
  return {
    tenantId: context.tenantId,
    organizationId: RequestContext.getOrganizationId(),
    userId: context.userId
  }
}
