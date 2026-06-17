import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ResumeImportStatus } from '../types.js'

@Entity('resume_import_batch')
export class ResumeImportBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar' })
  sourceFileName!: string

  @Column({ type: 'int', default: 0 })
  sourceFileSize!: number

  @Column({ type: 'varchar', default: 'uploaded' })
  status!: ResumeImportStatus

  @Column({ type: 'int', default: 0 })
  candidateCount!: number

  @Column({ type: 'int', default: 0 })
  documentCount!: number

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date
}
