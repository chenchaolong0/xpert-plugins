import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ResumeCandidateReparseJobStatus } from '../types.js'

@Entity('resume_candidate_reparse_job')
export class ResumeCandidateReparseJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar' })
  batchId!: string

  @Column({ type: 'varchar' })
  candidateId!: string

  @Column({ type: 'varchar' })
  candidateKey!: string

  @Column({ type: 'varchar', default: 'pending' })
  status!: ResumeCandidateReparseJobStatus

  @Column({ type: 'varchar', nullable: true })
  taskId?: string | null

  @Column({ type: 'varchar', nullable: true })
  executionId?: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  threadId?: string | null

  @Column({ type: 'varchar', nullable: true })
  clientMessageId?: string | null

  @Column({ type: 'text', nullable: true })
  prompt?: string | null

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date
}
