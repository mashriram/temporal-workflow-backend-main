import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowEdge, WorkflowNode } from '../workflow.types';

// One row per saved/deployed revision of a WorkflowDefinition — append
// only, never mutated, so version history is a straightforward audit
// trail (implementation.md §9). Backend-only: the engine never reads
// this, so no cross-repo duplication needed.
@Entity('workflow_versions')
export class WorkflowVersion {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  @Index()
  @Column()
  workflowId: string;

  @Column()
  versionNumber: number;

  @Column('simple-json')
  nodes: WorkflowNode[];

  @Column('simple-json')
  edges: WorkflowEdge[];

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
