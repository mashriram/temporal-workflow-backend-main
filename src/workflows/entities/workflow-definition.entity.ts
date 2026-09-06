import {
  Entity,
  PrimaryColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowRun } from './workflow-run.entity';
import { WorkflowEdge, WorkflowNode } from '../workflow.types';

@Entity('workflow_definitions')
export class WorkflowDefinition {
  // App-generated id (not DB-native uuid generation) — portable across
  // sql.js, Postgres, and Oracle identically.
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  @Column({ unique: true })
  workflowId: string;

  @Column()
  name: string;

  // -----------------------------------------------------------------
  // 1. LIFECYCLE STATE
  // -----------------------------------------------------------------

  // ✅ ADD THIS: Tracks UI State (Draft vs Published)
  @Column({ default: 'DRAFT' })
  status: string;

  // ✅ KEEP THIS: Tracks Execution State (On/Off switch)
  @Column({ default: false })
  isActive: boolean;

  // -----------------------------------------------------------------
  // 2. BLUEPRINT (UI Editor State)
  // -----------------------------------------------------------------
  // No DB-level `default` on simple-json — that requires dialect-specific
  // default-value SQL (works differently across sql.js/Postgres/Oracle);
  // a TS field initializer is portable and sufficient since these are
  // always set by the service on create.
  @Column('simple-json')
  nodes: WorkflowNode[] = [];

  @Column('simple-json')
  edges: WorkflowEdge[] = [];

  // -----------------------------------------------------------------
  // 3. EXECUTION SNAPSHOT (The "Compiled" Version)
  // -----------------------------------------------------------------
  @Column('simple-json', { nullable: true })
  deployedGraph: {
    steps: Record<string, any>;
    startAt: string;
  } | null;

  // -----------------------------------------------------------------
  // 4. TRIGGER CONFIG
  // -----------------------------------------------------------------
  @Column({ default: 'WEBHOOK' })
  triggerType: 'WEBHOOK' | 'SCHEDULE' | 'MANUAL';

  @Column({ type: 'text', nullable: true })
  cronExpression: string | null;

  // Default/last-used environment for this workflow's runs. A workflow
  // definition never hardcodes environment-specific values itself (see
  // {{env.X}} templating) — this is just a UX convenience default, always
  // overridable per run once a manual "start run" flow exists.
  @Column({ type: 'varchar', nullable: true })
  environmentId: string | null;

  // -----------------------------------------------------------------
  // 5. HISTORY
  // -----------------------------------------------------------------
  @OneToMany(() => WorkflowRun, (run) => run.definition)
  runs: WorkflowRun[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
