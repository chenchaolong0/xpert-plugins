import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { CandidateReviewStatus, CandidateProfilePayload } from '../types.js'

@Entity('resume_candidate_profile')
export class CandidateProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar' })
  batchId!: string

  @Column({ type: 'varchar' })
  candidateKey!: string

  @Column({ type: 'varchar', nullable: true })
  displayName?: string | null

  @Column({ type: 'varchar', default: 'pending' })
  status!: CandidateReviewStatus

  @Column({ type: 'json', nullable: true })
  profile?: CandidateProfilePayload | null

  @Column({ type: 'float', nullable: true })
  confidence?: number | null

  @Column({ type: 'text', nullable: true })
  parseError?: string | null

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date
}
