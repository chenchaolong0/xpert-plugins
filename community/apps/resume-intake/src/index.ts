import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  RESUME_INTAKE_FEATURE,
  RESUME_INTAKE_MIDDLEWARE_NAME,
  RESUME_INTAKE_PLUGIN_NAME,
  RESUME_INTAKE_PROVIDER_KEY,
  RESUME_INTAKE_TEMPLATE_PROVIDER_KEY,
  RESUME_INTAKE_VIEW_KEY
} from './lib/constants.js'
import {
  readResumeIntakePluginEnvDefaults,
  ResumeIntakePluginConfigFormSchema,
  ResumeIntakePluginConfigSchema
} from './lib/resume-intake.config.js'
import { ResumeIntakePlugin } from './lib/resume-intake.plugin.js'
import { resumeIntakeTemplates } from './lib/resume-intake.templates.js'

const ConfigSchema = ResumeIntakePluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> & { templates: typeof resumeIntakeTemplates } = {
  meta: {
    name: RESUME_INTAKE_PLUGIN_NAME,
    version: '0.1.0',
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities: [RESUME_INTAKE_FEATURE, 'resume-extraction', 'candidate-review-workbench'],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'resume-intake',
              displayName: 'Resume Intake',
              description:
                'Import resume ZIP packages, group candidate source files, extract structured profiles, and review field evidence.',
              icon: {
                type: 'emoji',
                value: '📄'
              },
              operations: [
                {
                  name: 'import-resume-zip',
                  displayName: 'Import resume ZIP packages',
                  description: 'Upload and validate resume ZIP batches with source documents grouped by candidate.',
                  access: 'write'
                },
                {
                  name: 'save-candidate-profiles',
                  displayName: 'Save candidate profiles',
                  description: 'Persist extracted candidate profiles with field-level source evidence.',
                  access: 'write'
                },
                {
                  name: 'review-candidate-results',
                  displayName: 'Review candidate results',
                  description: 'Approve, reject, preview, delete, and reparse resume intake results.',
                  access: 'admin'
                }
              ]
            },
            {
              type: 'view',
              name: RESUME_INTAKE_VIEW_KEY,
              displayName: 'Resume Review',
              description: 'Workbench view for resume ZIP batches, candidates, source files, evidence, and reparse tasks.'
            },
            {
              type: 'tool',
              name: RESUME_INTAKE_MIDDLEWARE_NAME,
              displayName: 'Resume Intake Agent Tools',
              description:
                'Assistant middleware tools for listing imported candidates, reading source documents, saving profiles, recording failures, and finalizing batches.'
            },
            {
              type: 'assistant-template',
              name: 'resume-intake-assistant',
              displayName: 'Resume Intake Assistant Template',
              description: 'Prebuilt assistant workflow template for extracting candidate profiles from resume ZIP batches.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [RESUME_INTAKE_MIDDLEWARE_NAME],
          viewProviders: [RESUME_INTAKE_PROVIDER_KEY],
          templateProviders: [RESUME_INTAKE_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'emoji',
      value: '📄'
    },
    displayName: 'Resume Intake',
    description: 'Upload resume ZIP packages, group candidate files, and save extracted candidate profiles for review.',
    keywords: ['resume', 'zip', 'candidate', 'middleware', 'workbench'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    formSchema: ResumeIntakePluginConfigFormSchema,
    defaults: readResumeIntakePluginEnvDefaults()
  },
  templates: resumeIntakeTemplates,
  register(ctx) {
    ctx.logger.log('register resume-intake plugin')
    return {
      module: ResumeIntakePlugin,
      global: true
    }
  },
  async onStart(ctx) {
    ctx.logger.log('resume-intake plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('resume-intake plugin stopped')
  }
}

export default plugin

export * from './lib/constants.js'
export * from './lib/resume-file-grouping.js'
export * from './lib/resume-intake.config.js'
export * from './lib/resume-intake.templates.js'
export * from './lib/entities/index.js'
