import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { WorkflowDefinition } from './workflows/entities/workflow-definition.entity';
import { WorkflowRun } from './workflows/entities/workflow-run.entity';
import { AuditLog } from './audit/entities/audit.entity';
import { Environment } from './environments/entities/environment.entity';
import { EnvironmentVariable } from './environments/entities/environment-variable.entity';
import { IntegrationConfig } from './integrations/entities/integration-config.entity';
import { ApprovalRequest } from './approvals/entities/approval-request.entity';
import { UploadedFile } from './uploads/entities/uploaded-file.entity';
import { User } from './auth/entities/user.entity';
import { WorkflowVersion } from './workflows/entities/workflow-version.entity';

// CLI-only DataSource for `typeorm migration:generate` / `migration:run`
// (used via the `migration:*` npm scripts). NOT used by the running app —
// database.module.ts's TypeOrmModule.forRootAsync is the runtime config,
// kept separate because the CLI needs a plain exported DataSource, not a
// NestJS-wrapped async factory. Keep this entity list in lockstep with
// database.module.ts's ENTITIES array.
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'postgres',
  entities: [
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
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
