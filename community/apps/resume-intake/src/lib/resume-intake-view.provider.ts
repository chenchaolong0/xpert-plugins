import { Inject, Injectable, Optional } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  IconDefinition,
  I18nObject,
  JsonSchemaObjectType,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import {
  AgentMiddlewareRuntimeCapabilityRegistry,
  AssistantTaskRuntimeCapability,
  FileRuntimeCapability,
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  XpertViewFileActionFile,
  XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  RESUME_INTAKE_FEATURE,
  RESUME_INTAKE_PLUGIN_NAME,
  RESUME_INTAKE_PROVIDER_KEY,
  RESUME_INTAKE_REMOTE_ENTRY_KEY,
  RESUME_INTAKE_TOOL_NAMES,
  RESUME_INTAKE_VIEW_KEY
} from './constants.js'
import { CandidateProfileService } from './candidate-profile.service.js'
import { ResumeZipImportService } from './resume-zip-import.service.js'
import { buildSourceDocumentChatFiles } from './source-document-attachments.js'
import type { ResumePluginScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const requireFromHere = createRequire(__filename)
const WORKBENCH_FILE_OPEN_COMMAND = 'workbench.file.open'
const SEND_CHAT_MESSAGE_COMMAND = 'assistant.chat.send_message'
const RESUME_REVIEW_VIEW_ICON = {
  type: 'svg',
  value:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/><circle cx="10" cy="9" r="1"/></svg>',
  alt: 'Resume Intake'
} satisfies IconDefinition

const reviewCommentInputSchema = {
  type: 'object',
  properties: {
    reviewComment: {
      type: 'string',
      title: text('Review Comment', '审核备注')
    }
  }
} satisfies JsonSchemaObjectType

const reparseInputSchema = {
  type: 'object',
  properties: {
    candidateId: {
      type: 'string',
      title: text('Candidate ID', '候选人 ID')
    },
    prompt: {
      type: 'string',
      title: text('Prompt', '提示词')
    },
    reparseJobId: {
      type: 'string',
      title: text('Reparse Job ID', '重识别任务 ID')
    },
    conversationId: {
      type: 'string',
      title: text('Conversation ID', '会话 ID')
    },
    projectId: {
      type: 'string',
      title: text('Project ID', '项目 ID')
    },
    threadId: {
      type: 'string',
      title: text('Thread ID', '线程 ID')
    },
    clientMessageId: {
      type: 'string',
      title: text('Client Message ID', '客户端消息 ID')
    },
    errorMessage: {
      type: 'string',
      title: text('Error Message', '错误信息')
    }
  }
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(RESUME_INTAKE_PROVIDER_KEY)
export class ResumeIntakeViewProvider implements IXpertViewExtensionProvider {
  constructor(
    @Inject(ResumeZipImportService)
    private readonly zipImportService: ResumeZipImportService,
    @Inject(CandidateProfileService)
    private readonly candidateService: CandidateProfileService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }

    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT

    return [
      {
        key: RESUME_INTAKE_VIEW_KEY,
        title: text('Resume Review', '简历识别工作台'),
        description: text(
          'Upload resume ZIP packages, extract candidate profiles with the assistant, and review evidence.',
          '上传简历 ZIP 包，使用助手提取候选人结构化信息，并审核来源证据。'
        ),
        icon: RESUME_REVIEW_VIEW_ICON,
        hostType: 'agent',
        slot,
        order: fixed ? 30 : 10,
        refreshable: true,
        activation: {
          requiredFeatures: [RESUME_INTAKE_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
	                  enabled: true,
	                  label: text('Resume Intake', '简历识别'),
	                  order: 30,
	                  icon: RESUME_REVIEW_VIEW_ICON
	                }
              }
            }
          : {}),
        source: {
          provider: RESUME_INTAKE_PROVIDER_KEY,
          plugin: RESUME_INTAKE_PLUGIN_NAME
        },
        parameters: [
          {
            key: 'batchId',
            label: text('Import Batch ID', '导入批次 ID'),
            type: 'string'
          },
          {
            key: 'candidateId',
            label: text('Candidate ID', '候选人 ID'),
            type: 'string'
          }
        ],
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: RESUME_INTAKE_REMOTE_ENTRY_KEY
          },
          dataSource: {
            mode: 'platform'
          }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsSearch: true,
            supportsSort: true,
            supportsParameters: true,
            defaultPageSize: 50
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'resume-intake-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...RESUME_INTAKE_TOOL_NAMES]
              },
              action: {
                type: 'forward',
                debounceMs: 1000
              }
            }
          ]
        },
        clientCommands: [
          {
            key: SEND_CHAT_MESSAGE_COMMAND,
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          },
          {
            key: WORKBENCH_FILE_OPEN_COMMAND,
            label: text('Open Workbench File Preview', '打开 Workbench 文件预览')
          }
        ],
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'upload_resume_zip',
            label: text('Upload ZIP', '上传 ZIP'),
            icon: 'ri-upload-cloud-2-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'delete_import_batch',
            label: text('Delete Batch', '删除批次'),
            icon: 'ri-delete-bin-line',
            placement: 'row',
            actionType: 'invoke'
          },
          {
            key: 'prepare_import_batch_reparse_chat_message',
            label: text('Reparse Batch', '重新解析批次'),
            icon: 'ri-loop-right-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: reparseInputSchema
          },
          {
            key: 'approve_candidate',
            label: text('Approve', '确认'),
            icon: 'ri-check-line',
            placement: 'row',
            actionType: 'invoke'
          },
          {
            key: 'reject_candidate',
            label: text('Reject', '驳回'),
            icon: 'ri-close-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: reviewCommentInputSchema
          },
          {
            key: 'resolve_source_document_file',
            label: text('Resolve Source Document File', '解析来源文件'),
            icon: 'ri-file-search-line',
            actionType: 'invoke'
          },
          {
            key: 'prepare_candidate_reparse_chat_message',
            label: text('Prepare Reparse Chat Message', '准备重识别对话消息'),
            icon: 'ri-chat-forward-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: reparseInputSchema
          },
          {
            key: 'start_candidate_reparse',
            label: text('Start Reparse Task', '启动重识别任务'),
            icon: 'ri-loop-right-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: reparseInputSchema
          },
          {
            key: 'mark_candidate_reparse_dispatched',
            label: text('Mark Reparse Dispatched', '标记重识别已发送'),
            icon: 'ri-check-line',
            actionType: 'invoke',
            inputSchema: reparseInputSchema
          },
          {
            key: 'mark_candidate_reparse_failed',
            label: text('Mark Reparse Failed', '标记重识别失败'),
            icon: 'ri-error-warning-line',
            actionType: 'invoke',
            inputSchema: reparseInputSchema
          }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== RESUME_INTAKE_VIEW_KEY || component.entry !== RESUME_INTAKE_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const [react, reactDom] = await Promise.all([
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    const appScript = await readFile(join(__dirname, 'remote-components', RESUME_INTAKE_REMOTE_ENTRY_KEY, 'app.js'), 'utf8')

    return {
      html: renderRemoteReactIframeHtml({
        title: '简历识别工作台',
        lang: 'zh-Hans',
        reactUmd: react,
        reactDomUmd: reactDom,
        appScript
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== RESUME_INTAKE_VIEW_KEY) {
      return { items: [], total: 0 }
    }

    const scope = scopeFromViewContext(context)
    const viewMode = getStringParameter(query.parameters, 'viewMode') ?? 'batches'
    const batchId = getStringParameter(query.parameters, 'batchId')
    const candidateId = getStringParameter(query.parameters, 'candidateId')

    if (viewMode === 'candidates') {
      const candidates = await this.candidateService.listCandidates(scope, batchId, query.pageSize ?? 100)
      return {
        items: candidates.map((candidate) => {
          const profile = candidate.profile ?? {}
          return {
            id: candidate.id,
            batchId: candidate.batchId,
            candidateKey: candidate.candidateKey,
            displayName: candidate.displayName ?? profile.name ?? candidate.candidateKey,
            phone: profile.phone ?? '',
            email: profile.email ?? '',
            targetPosition: profile.targetPosition ?? '',
            highestDegree: profile.highestDegree ?? '',
            school: profile.school ?? '',
            status: candidate.status,
            confidence: candidate.confidence,
            parseError: candidate.parseError,
            updatedAt: candidate.updatedAt
          }
        }),
        total: candidates.length,
        meta: {
          viewMode,
          batchId
        }
      }
    }

    if (viewMode === 'candidate_detail' && candidateId) {
      const candidates = await this.candidateService.listCandidates(scope, batchId, query.pageSize ?? 100)
      const candidate = candidates.find((item) => item.id === candidateId)
      if (!candidate) {
        return { items: [], total: 0, meta: { viewMode, candidateId } }
      }
      const [documents, evidence, reparseJobs] = await Promise.all([
        this.candidateService.listCandidateDocuments(scope, candidate.batchId, candidate.candidateKey),
        this.candidateService.listCandidateEvidence(scope, candidate.id),
        this.candidateService.listReparseJobs(scope, candidate.id, 20)
      ])
      return {
        items: [
          {
            candidate,
            documents,
            evidence,
            reparseJobs
          }
        ],
        total: 1,
        meta: {
          viewMode,
          batchId: candidate.batchId,
          candidateId: candidate.id
        }
      }
    }

    if (viewMode === 'documents' && batchId) {
      const documents = await this.candidateService.listCandidateDocuments(scope, batchId)
      return {
        items: documents,
        total: documents.length,
        meta: {
          viewMode,
          batchId
        }
      }
    }

    if (viewMode === 'reparse_jobs') {
      const jobs = await this.candidateService.listReparseJobs(scope, candidateId, query.pageSize ?? 50)
      return {
        items: jobs,
        total: jobs.length,
        meta: {
          viewMode,
          candidateId
        }
      }
    }

    const batches = await this.candidateService.listBatches(scope, query.pageSize ?? 50)
    return {
      items: batches,
      total: batches.length,
      meta: {
        viewMode: 'batches'
      }
    }
  }

  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    _request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    if (viewKey !== RESUME_INTAKE_VIEW_KEY) {
      return failure('Unsupported view.', '不支持的视图。')
    }

    if (actionKey !== 'upload_resume_zip') {
      return failure('Unsupported file action.', '不支持的文件操作。')
    }

    try {
      const result = await this.zipImportService.importZip(
        {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        },
        scopeFromViewContext(context)
      )

      const documents = await buildSourceDocumentChatFiles(result.documents)

      return {
        ...success('Resume ZIP imported.', '简历 ZIP 已导入。'),
        data: {
          batchId: result.batch.id,
          candidateCount: result.candidates.length,
          documentCount: result.documents.length,
          documents
        }
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Resume ZIP import failed.')
      return failure(message, message)
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== RESUME_INTAKE_VIEW_KEY) {
      return failure('Unsupported view.', '不支持的视图。')
    }

    try {
      const scope = scopeFromViewContext(context)

      if (actionKey === 'refresh') {
        return success('Resume view refreshed.', '简历识别视图已刷新。')
      }

      if (actionKey === 'approve_candidate') {
        await this.candidateService.updateCandidateStatus(scope, requireTargetId(request, 'Candidate id is required.'), 'approved')
        return success('Candidate approved.', '候选人信息已确认。')
      }

      if (actionKey === 'reject_candidate') {
        await this.candidateService.updateCandidateStatus(scope, requireTargetId(request, 'Candidate id is required.'), 'rejected')
        return success('Candidate rejected.', '候选人信息已驳回。')
      }

      if (actionKey === 'delete_import_batch') {
        const batchId = getStringInput(request.input, 'batchId') ?? requireTargetId(request, 'Import batch id is required.')
        const batch = await this.candidateService.deleteImportBatch(scope, batchId)
        return {
          ...success('Import batch deleted.', '简历批次已删除。'),
          data: {
            batchId: batch.id
          }
        }
      }

      if (actionKey === 'prepare_import_batch_reparse_chat_message') {
        const batchId = getStringInput(request.input, 'batchId') ?? requireTargetId(request, 'Import batch id is required.')
        const message = await this.candidateService.prepareImportBatchReparseChatMessage(
          scope,
          batchId,
          getStringInput(request.input, 'prompt')
        )
        return {
          ...success('Import batch reparse message is ready.', '批次重新解析消息已准备好。'),
          data: message,
          refresh: false
        }
      }

      if (actionKey === 'resolve_source_document_file') {
        const documentId = getStringInput(request.input, 'documentId') ?? requireTargetId(request, 'Source document id is required.')
        const document = await this.candidateService.findSourceDocument(scope, documentId)
        const file = await this.resolveOpenableFile(document)
        return {
          ...success('Source document file is ready.', '来源文件已就绪。'),
          data: file,
          refresh: false
        }
      }

      if (actionKey === 'prepare_candidate_reparse_chat_message') {
        const candidateId = getStringInput(request.input, 'candidateId') ?? requireTargetId(request, 'Candidate id is required.')
        const message = await this.candidateService.prepareCandidateReparseChatMessage(
          scope,
          candidateId,
          getStringInput(request.input, 'prompt')
        )
        return {
          ...success('Candidate reparse message is ready.', '候选人重识别消息已准备好。'),
          data: message,
          refresh: false
        }
      }

      if (actionKey === 'start_candidate_reparse') {
        const candidateId = getStringInput(request.input, 'candidateId') ?? requireTargetId(request, 'Candidate id is required.')
        const message = await this.candidateService.prepareCandidateReparseChatMessage(
          scope,
          candidateId,
          getStringInput(request.input, 'prompt')
        )
        const assistantTask = this.runtimeCapabilities?.get(AssistantTaskRuntimeCapability)
        if (!assistantTask?.startTask) {
          return {
            ...success('Candidate reparse chat message is ready.', 'Assistant 后台任务不可用，已生成重识别对话消息。'),
            data: message,
            refresh: false
          }
        }
        const result = await assistantTask.startTask({
          xpertId: context.hostId,
          agentKey: getStringParameter(request.parameters, 'agentKey'),
          conversationId: getStringInput(request.input, 'conversationId'),
          projectId: getStringInput(request.input, 'projectId'),
          taskId: message.context.reparseJobId,
          prompt: message.input,
          files: message.files,
          context: message.context
        })
        await this.candidateService.markReparseJob(scope, {
          reparseJobId: message.context.reparseJobId,
          status: result.status === 'failed' ? 'failed' : 'running',
          taskId: result.taskId,
          executionId: result.executionId,
          conversationId: result.conversationId,
          threadId: result.threadId,
          errorMessage: result.errorMessage
        })
        return {
          ...success('Candidate reparse task started.', '候选人重识别任务已启动。'),
          data: {
            ...message,
            task: result
          }
        }
      }

      if (actionKey === 'mark_candidate_reparse_dispatched') {
        const job = await this.candidateService.markReparseJob(scope, {
          reparseJobId: requireStringInput(request.input, 'reparseJobId'),
          status: 'dispatched',
          conversationId: getStringInput(request.input, 'conversationId'),
          threadId: getStringInput(request.input, 'threadId'),
          clientMessageId: getStringInput(request.input, 'clientMessageId')
        })
        return {
          ...success('Candidate reparse was marked as dispatched.', '候选人重识别已标记为发送。'),
          data: job
        }
      }

      if (actionKey === 'mark_candidate_reparse_failed') {
        const job = await this.candidateService.markReparseJob(scope, {
          reparseJobId: requireStringInput(request.input, 'reparseJobId'),
          status: 'failed',
          errorMessage: getStringInput(request.input, 'errorMessage') ?? 'Candidate reparse failed.'
        })
        return {
          ...success('Candidate reparse was marked as failed.', '候选人重识别已标记为失败。'),
          data: job
        }
      }

      return failure('Unsupported action.', '不支持的操作。')
    } catch (error) {
      const message = getErrorMessage(error, 'Action failed.')
      return failure(message, message)
    }
  }

  private async resolveOpenableFile(document: {
    id: string
    fileName: string
    mimeType?: string | null
    fileSize: number
    fileAssetId?: string | null
    storageFileId?: string | null
    fileUrl?: string | null
    previewUrl?: string | null
  }) {
    const fileApi = this.runtimeCapabilities?.get(FileRuntimeCapability)
    if (!fileApi?.resolveFile) {
      const directUrl = optionalString(document.previewUrl) ?? optionalString(document.fileUrl)
      if (!directUrl) {
        throw new Error('File preview resolver is unavailable.')
      }
      return {
        id: document.id,
        name: document.fileName,
        mimeType: optionalString(document.mimeType),
        size: document.fileSize,
        url: directUrl,
        previewUrl: directUrl
      }
    }

    const resolved = await fileApi.resolveFile({
      id: document.id,
      fileAssetId: optionalString(document.fileAssetId),
      storageFileId: optionalString(document.storageFileId),
      name: document.fileName,
      mimeType: optionalString(document.mimeType),
      size: document.fileSize,
      url: optionalString(document.fileUrl),
      previewUrl: optionalString(document.previewUrl)
    })
    if (!resolved?.url) {
      throw new Error('Source document file URL is unavailable.')
    }
    return resolved
  }
}

function scopeFromViewContext(context: XpertResolvedViewHostContext): ResumePluginScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function getStringParameter(parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'], key: string) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function getStringInput(input: XpertViewActionRequest['input'], key: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined
  }
  const value = input[key as keyof typeof input]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function requireStringInput(input: XpertViewActionRequest['input'], key: string) {
  const value = getStringInput(input, key)
  if (!value) {
    throw new Error(`${key} is required.`)
  }
  return value
}

function requireTargetId(request: XpertViewActionRequest, message: string) {
  const targetId = request.targetId?.trim()
  if (!targetId) {
    throw new Error(message)
  }
  return targetId
}

function optionalString(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: true,
    refresh: true,
    message: text(en_US, zh_Hans)
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans)
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageJsonPath = requireFromHere.resolve(`${packageName}/package.json`)
  return readFile(join(dirname(packageJsonPath), relativePath), 'utf8')
}
