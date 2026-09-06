import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

@Entity('audit_logs') // Explicit table name ensures both repos map to same table
export class AuditLog {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  // This links the log to the specific execution (runId)
  @Index()
  @Column()
  workflowRunId: string;

  // This links the log to your business logic ID (e.g. "wf_176...")
  @Index()
  @Column()
  workflowId: string;

  @Column()
  nodeId: string;

  @Column()
  nodeName: string;

  @Column()
  nodeType: string;

  @Column()
  status: 'STARTED' | 'COMPLETED' | 'FAILED';

  @Column('simple-json', { nullable: true })
  details: any; // Inputs, Outputs, Errors

  @CreateDateColumn()
  timestamp: Date;
}
