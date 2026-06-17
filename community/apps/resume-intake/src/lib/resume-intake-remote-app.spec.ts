import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const RESUME_INTAKE_REMOTE_APP_SCRIPT = readFileSync(
  join(__dirname, 'remote-components', 'resume-review', 'app.js'),
  'utf8'
)

assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('function actionData(response)'),
  'remote app should unwrap platform action result data'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('const data = actionData(response)'),
  'upload handler should read data from the action result payload'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('.then((data) => data && data.batchId'),
  'upload handler should carry upload action data into the post-upload refresh step'
)
assert(
  !RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('.then(() => data && data.batchId'),
  'upload handler must not reference upload action data outside its promise scope'
)
assert(
  !RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('const data = response.data || {}'),
  'upload handler must not read data directly from the transport message'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("return request('requestData', { query }).then((response) => response.data || {})"),
  'data query handler should continue to read platform data messages directly'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('let pendingInitialContext = null'),
  'remote app should preserve init context if the host sends it before React effects are registered'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('pendingInitialContext = context'),
  'remote app should cache early init context instead of dropping it'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('applyInitialContext(pendingInitialContext)'),
  'remote app should replay cached init context after React mounts'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('function clientCommandResult(response)'),
  'remote app should unwrap client command results'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("return request('invokeClientCommand', { commandKey, payload }).then(clientCommandResult)"),
  'client command helper should return the command result payload'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('function autoStartBatchRecognition(data)'),
  'remote app should automatically start assistant recognition after upload'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("invokeClientCommand(message.commandKey || 'assistant.chat.send_message'"),
  'auto recognition should send one batch message to the assistant chat'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("executeAction('prepare_import_batch_reparse_chat_message'"),
  'auto recognition should prepare a single batch message because the platform only handles the last of multiple sent messages'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('files'),
  'auto recognition should attach prioritized source files'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('已发送批次自动识别请求'),
  'auto recognition should report that one batch recognition request was sent'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('function startRecognitionRefreshWindow()'),
  'remote app should start a refresh window after sending recognition requests'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('const refreshTimer = window.setInterval'),
  'remote app should poll for recognition results while assistant parsing is running'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('loadCurrent({ silent: true })'),
  'recognition result polling should refresh data without showing the loading overlay'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('const noticeTimer = window.setTimeout'),
  'operation notices should disappear automatically'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("if (!silent) showNotice(error.message || '加载失败'"),
  'silent refresh errors should not keep or replace operation notices'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('files: message.files || []'),
  'manual reparse should attach candidate source files to the assistant message'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("executeAction('delete_import_batch'"),
  'batch list should call delete action'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("executeAction('prepare_import_batch_reparse_chat_message'"),
  'batch list should prepare one batch reparse message'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('重新解析'),
  'batch list should render batch reparse button text'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('function sendBatchRecognitionMessage(batchId, message)'),
  'batch reparse should dispatch one assistant message for the whole batch'
)
assert(
  !RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('messages.reduce((chain, message)'),
  'batch reparse must not send multiple assistant messages because the platform only processes the last one'
)
assert(
  !RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("actionKey: 'mark_candidate_reparse_dispatched'"),
  'batch reparse should not create per-candidate dispatched markers for a single batch message'
)
assert(
  !RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("executeAction('prepare_import_batch_candidate_reparse_chat_messages'"),
  'batch reparse should not use candidate-scoped multi-message action from the remote app'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('删除该批次及其识别结果？'),
  'batch delete should ask for confirmation'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes("document.attachmentKind === 'rendered_pdf_page'"),
  'auto recognition should prioritize rendered PDF page images over original PDFs'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('html,body,#root{height:100%;overflow:hidden;}'),
  'remote app should keep the iframe document height bounded'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('.resume-shell>.panel,.resume-shell>.detail-grid,.resume-shell>.empty{flex:1;min-height:0;overflow:auto;}'),
  'active tab content should scroll when it exceeds the workbench height'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('function interleaveDocumentsByCandidate(documents)'),
  'auto recognition should interleave attachments by candidate instead of taking the first candidates only'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('const maxFiles = 40'),
  'auto recognition should allow enough rendered page images for medium resume batches'
)
assert(
  RESUME_INTAKE_REMOTE_APP_SCRIPT.includes('renderedSourceIds.has(document.sourceDocumentId)'),
  'auto recognition should avoid wasting attachment slots on original PDFs that already have rendered page images'
)

console.log('resume-intake-remote-app.spec.ts passed')
