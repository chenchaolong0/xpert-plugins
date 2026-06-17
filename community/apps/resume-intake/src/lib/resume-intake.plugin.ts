import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { CandidateProfileService } from './candidate-profile.service.js'
import { RESUME_INTAKE_CONFIG } from './constants.js'
import { ResumeIntakeMiddleware } from './resume-intake.middleware.js'
import { ResumeIntakeViewProvider } from './resume-intake-view.provider.js'
import { ResumeZipImportService } from './resume-zip-import.service.js'
import {
  CandidateFieldEvidence,
  CandidateProfile,
  ResumeCandidateReparseJob,
  ResumeImportBatch,
  ResumeSourceDocument
} from './entities/index.js'

export const RESUME_INTAKE_ENTITIES = [
  ResumeImportBatch,
  ResumeSourceDocument,
  CandidateProfile,
  CandidateFieldEvidence,
  ResumeCandidateReparseJob
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(RESUME_INTAKE_ENTITIES)],
  entities: RESUME_INTAKE_ENTITIES,
  providers: [
    CandidateProfileService,
    ResumeZipImportService,
    ResumeIntakeMiddleware,
    ResumeIntakeViewProvider
  ],
  exports: [CandidateProfileService, ResumeZipImportService]
})
export class ResumeIntakePlugin {}

export const ResumeIntakeConfigProviderToken = RESUME_INTAKE_CONFIG
