import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

export const ResumeIntakePluginConfigSchema = z.object({
  maxZipSizeMb: z.number().int().positive().optional(),
  maxFileCount: z.number().int().positive().optional(),
  maxUncompressedSizeMb: z.number().int().positive().optional(),
  allowedExtensions: z.array(z.string()).optional(),
  duplicateStrategy: z.enum(['create_new', 'skip', 'merge']).optional()
})

export type ResumeIntakePluginConfig = z.infer<typeof ResumeIntakePluginConfigSchema>

export const ResumeIntakePluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    maxZipSizeMb: {
      type: 'number',
      title: text('Maximum ZIP Size (MB)', 'ZIP 最大大小（MB）'),
      default: 200
    },
    maxFileCount: {
      type: 'number',
      title: text('Maximum File Count', '最大文件数'),
      default: 500
    },
    maxUncompressedSizeMb: {
      type: 'number',
      title: text('Maximum Uncompressed Size (MB)', '解压后最大大小（MB）'),
      default: 1000
    },
    allowedExtensions: {
      type: 'array',
      title: text('Allowed File Extensions', '允许的文件扩展名'),
      items: {
        type: 'string'
      },
      default: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png']
    },
    duplicateStrategy: {
      type: 'string',
      title: text('Duplicate Strategy', '重复候选人策略'),
      enum: ['create_new', 'skip', 'merge'],
      default: 'create_new'
    }
  }
}

export function readResumeIntakePluginEnvDefaults(): Partial<ResumeIntakePluginConfig> {
  return {
    ...readPositiveIntegerEnv('RESUME_INTAKE_MAX_ZIP_SIZE_MB', 'maxZipSizeMb'),
    ...readPositiveIntegerEnv('RESUME_INTAKE_MAX_FILE_COUNT', 'maxFileCount'),
    ...readPositiveIntegerEnv('RESUME_INTAKE_MAX_UNCOMPRESSED_SIZE_MB', 'maxUncompressedSizeMb')
  }
}

function readPositiveIntegerEnv<Key extends keyof ResumeIntakePluginConfig>(envName: string, key: Key) {
  const value = Number(process.env[envName])
  if (!Number.isFinite(value) || value <= 0) {
    return {}
  }
  return { [key]: Math.trunc(value) } as Pick<ResumeIntakePluginConfig, Key>
}
