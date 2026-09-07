import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

// IMPORTANT: duplicated in the engine repo
// (src/entity/approval-request.entity.ts) against the SAME physical
// table — both repos run synchronize:true in dev, so any column added to
// one copy must be added to the other in the same change, or whichever
// process boots second silently drops it (see the same warning on
// WorkflowDefinition.environmentId from Phase 1).
@Entity('approval_requests')
export class ApprovalRequest {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  @Index()
  @Column()
  runId: string; // Temporal run id

  @Column()
  nodeId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Column({ default: false })
  requireProofUpload: boolean;

  @Column({ default: 'pending' })
  status: 'pending' | 'approved';

  @CreateDateColumn()
  requestedAt: Date;

  // A nullable `Date | null` union reflects as `Object` via TS's
  // design:type metadata (unions can't be represented as one runtime
  // constructor) — sql.js's driver rejects that outright, and 'timestamp'
  // isn't valid for sql.js either (Postgres/Oracle only). 'datetime' is
  // the one explicit type sql.js/Postgres/Oracle all accept here.
  @Column({ type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'varchar', nullable: true })
  proofFileId: string | null;
}
