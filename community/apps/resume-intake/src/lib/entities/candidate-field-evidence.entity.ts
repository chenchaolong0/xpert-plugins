import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('resume_candidate_field_evidence')
export class CandidateFieldEvidence {
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
  field!: string

  @Column({ type: 'text', nullable: true })
  value?: string | null

  @Column({ type: 'varchar', nullable: true })
  documentName?: string | null

  @Column({ type: 'int', nullable: true })
  page?: number | null

  @Column({ type: 'text' })
  evidenceText!: string

  @Column({ type: 'float', nullable: true })
  confidence?: number | null

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date
}
