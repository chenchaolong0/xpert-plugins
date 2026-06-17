import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'
import type { ResumeDocumentRole } from '../resume-file-grouping.js'

@Entity('resume_source_document')
export class ResumeSourceDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar' })
  batchId!: string

  @Column({ type: 'varchar', nullable: true })
  candidateId?: string | null

  @Column({ type: 'varchar' })
  candidateKey!: string

  @Column({ type: 'varchar' })
  relativePath!: string

  @Column({ type: 'varchar' })
  fileName!: string

  @Column({ type: 'varchar' })
  documentRole!: ResumeDocumentRole

  @Column({ type: 'varchar', nullable: true })
  mimeType?: string | null

  @Column({ type: 'int', default: 0 })
  fileSize!: number

  @Column({ type: 'varchar' })
  contentHash!: string

  @Column({ type: 'varchar', nullable: true })
  storageKey?: string | null

  @Column({ type: 'varchar', nullable: true })
  fileAssetId?: string | null

  @Column({ type: 'varchar', nullable: true })
  storageFileId?: string | null

  @Column({ type: 'text', nullable: true })
  fileUrl?: string | null

  @Column({ type: 'text', nullable: true })
  previewUrl?: string | null

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date
}
