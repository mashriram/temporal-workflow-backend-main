import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowDefinition } from './workflow-definition.entity';

@Entity('workflow_runs')
export class WorkflowRun {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  // --------------------------------------------------------
  // 1. TEMPORAL LINKS
  // --------------------------------------------------------

  @Index() // Good choice, you will query by this often
  @Column()
  temporalWorkflowId: string;

  @Index() // Critical for linking signals/queries
  @Column()
  temporalRunId: string;

  // --------------------------------------------------------
  // 2. STATUS & RESULTS
  // --------------------------------------------------------

  @Index() // Useful for filtering "Show me all Failed runs"
  @Column()
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TERMINATED';

  // Snapshot of input (Webhook body, etc.)
  @Column('simple-json', { nullable: true })
  input: any;

  // Snapshot of final output
  @Column('simple-json', { nullable: true })
  output: any;

  // ✅ ADDITION 1: Explicit Error Column
  // If status === 'FAILED', store the error message here.
  // It's much faster to read a string column than parsing the 'output' JSON for errors.
  @Column({ type: 'text', nullable: true })
  error: string | null;

  // ✅ ADDITION 2: Searchable Metadata / Context
  // Store business keys here (e.g., { "email": "user@gmail.com", "leadId": "123" }).
  // This allows you to build a "Search Runs by Email" feature in your UI.
  @Column('simple-json')
  metadata: Record<string, any> = {};

  // ✅ ADDITION 3: Trigger Context
  // Helps you show in the UI: "Started by Cron" vs "Started by Webhook"
  @Column({ default: 'WEBHOOK' })
  triggerType: 'WEBHOOK' | 'SCHEDULE' | 'MANUAL';

  // --------------------------------------------------------
  // 3. RELATIONS
  // --------------------------------------------------------

  @ManyToOne(() => WorkflowDefinition, (def) => def.runs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'definitionId' }) // Optional, but good practice
  definition: WorkflowDefinition;

  // Explicit column for the relation ID is often helpful for efficient querying
  // without joining the whole table.
  @Column({ nullable: true })
  definitionId: string;

  // --------------------------------------------------------
  // 4. TIMESTAMPS
  // --------------------------------------------------------

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
