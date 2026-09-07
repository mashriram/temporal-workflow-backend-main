import { DataSource } from 'typeorm';
import { WorkflowDefinition } from '../workflows/entities/workflow-definition.entity';
import { WorkflowRun } from '../workflows/entities/workflow-run.entity';
import { AuditLog } from '../audit/entities/audit.entity';
import { Environment } from '../environments/entities/environment.entity';
import { EnvironmentVariable } from '../environments/entities/environment-variable.entity';
import { IntegrationConfig } from '../integrations/entities/integration-config.entity';
import { ApprovalRequest } from '../approvals/entities/approval-request.entity';
import { UploadedFile } from '../uploads/entities/uploaded-file.entity';
import { User } from '../auth/entities/user.entity';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';

const ENTITIES = [
  WorkflowDefinition,
  WorkflowRun,
  AuditLog,
  Environment,
  EnvironmentVariable,
  IntegrationConfig,
  ApprovalRequest,
  UploadedFile,
  User,
  WorkflowVersion,
];

// REGRESSION TEST: every entity in this app must actually be able to boot
// against sql.js — the office machine's ONLY working DB driver
// (goal.md's hard deployment-target constraint). This exact scenario
// (ApprovalRequest.resolvedAt declared `@Column({ type: 'timestamp',
// nullable: true })`) booted fine against Postgres in every manual test
// this session, and would have silently shipped a sql.js-breaking entity
// straight to the one machine that actually needs sql.js to work — nobody
// smoke-tested that target after Phase 6 added the entity. This test
// makes that class of mistake fail fast, in CI, every time.
describe('Entity schema — sql.js compatibility (office-machine deployment target)', () => {
  it('initializes a real sql.js DataSource with every entity in the app with no DataTypeNotSupportedError', async () => {
    const dataSource = new DataSource({
      type: 'sqljs',
      autoSave: false,
      entities: ENTITIES,
      synchronize: true,
    });

    await expect(dataSource.initialize()).resolves.toBeDefined();
    await dataSource.destroy();
  });
});
