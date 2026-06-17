import assert from 'node:assert/strict'
import plugin from '../index.js'
import {
  RESUME_INTAKE_MIDDLEWARE_NAME,
  RESUME_INTAKE_PLUGIN_NAME,
  RESUME_INTAKE_TOOL_NAMES
} from './constants.js'

const templates = plugin.templates ?? []
assert.equal(templates.length, 1)

const [template] = templates
assert.equal(template.key, 'resume-intake-assistant')
assert.equal(template.type, 'agent')
assert.deepEqual(template.targetApps, ['data-xpert'])
assert.deepEqual(template.targetAppMeta?.['data-xpert']?.requiredPlugins, [RESUME_INTAKE_PLUGIN_NAME])
assert(template.targetAppMeta?.['data-xpert']?.capabilities?.includes('resume-extraction'))
assert(template.dslContent.includes(`provider: ${RESUME_INTAKE_MIDDLEWARE_NAME}`))
assert(template.dslContent.includes('features:'))
assert(template.dslContent.includes('attachment:'))
assert(template.startPrompts.some((prompt: string) => prompt.includes('简历 ZIP')))
for (const toolName of RESUME_INTAKE_TOOL_NAMES) {
  assert(template.instructions.includes(toolName))
}

console.log('resume-intake.templates.spec.ts passed')
