import assert from 'node:assert/strict'
import { ResumeIntakeMiddleware } from './resume-intake.middleware.js'
import { ResumeIntakeViewProvider } from './resume-intake-view.provider.js'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  RESUME_INTAKE_REMOTE_ENTRY_KEY,
  RESUME_INTAKE_TOOL_NAMES,
  RESUME_INTAKE_VIEW_KEY
} from './constants.js'

const noopService = {}

function readSelfParamIndexes(target: Function) {
  const value: unknown = Reflect.getMetadata('self:paramtypes', target)
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    if (typeof item === 'object' && item !== null && 'index' in item) {
      const index = item.index
      if (typeof index === 'number') {
        return index
      }
    }
    throw new Error('Invalid self:paramtypes metadata item')
  })
}

assert.deepEqual(readSelfParamIndexes(ResumeIntakeMiddleware).sort(), [0])
assert.deepEqual(readSelfParamIndexes(ResumeIntakeViewProvider).sort(), [0, 1, 2])

const provider = new ResumeIntakeViewProvider(
  noopService as never,
  noopService as never,
  {
    get() {
      return undefined
    }
  } as never
)

const context = {
  hostType: 'agent',
  hostId: 'assistant-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'user-1'
} as never

const [manifest] = provider.getViewManifests(context, AGENT_WORKBENCH_FIXED_SLOT)
assert.equal(manifest.key, RESUME_INTAKE_VIEW_KEY)
assert.equal(manifest.view.type, 'remote_component')
assert.equal(manifest.view.component.entry, RESUME_INTAKE_REMOTE_ENTRY_KEY)
assert.equal(manifest.workbench?.fixed, true)
assert.equal(manifest.hostEvents?.subscriptions?.[0]?.action.type, 'forward')
assert.deepEqual(manifest.hostEvents?.subscriptions?.[0]?.filter?.toolNames, RESUME_INTAKE_TOOL_NAMES)

const actionKeys = new Set(manifest.actions?.map((action) => action.key))
for (const key of [
  'upload_resume_zip',
  'delete_import_batch',
  'prepare_import_batch_reparse_chat_message',
  'resolve_source_document_file',
  'prepare_candidate_reparse_chat_message',
  'start_candidate_reparse',
  'approve_candidate',
  'reject_candidate'
]) {
  assert(actionKeys.has(key), `missing action ${key}`)
}
assert(
  !actionKeys.has('prepare_import_batch_candidate_reparse_chat_messages'),
  'batch candidate multi-message action should not be exposed while the platform only processes the last sent message'
)

void provider
  .getRemoteComponentEntry(context, RESUME_INTAKE_VIEW_KEY, {
    isolation: 'iframe',
    entry: RESUME_INTAKE_REMOTE_ENTRY_KEY
  })
  .then((entry) => {
    assert.equal(entry.contentType, 'text/html; charset=utf-8')
    assert(entry.html.includes('简历识别工作台'))
    assert(entry.html.includes("executeAction('delete_import_batch'"), 'remote app should call delete batch action')
    assert(entry.html.includes("executeAction('prepare_import_batch_reparse_chat_message'"), 'remote app should call single-message batch reparse action')
    assert(entry.html.includes('删除该批次及其识别结果？'), 'remote app should confirm before deleting a batch')
    assert(entry.html.includes('重新解析'), 'remote app should render reparse button text')
    assert(entry.html.includes('删除'), 'remote app should render delete button text')
    console.log('resume-intake-view.provider.spec.ts passed')
  })
