import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
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

// This process is the schema owner: it's the only one of the three repos
// that runs migrations. The engine points at the same physical database
// with synchronize/migrationsRun both off in production — it trusts the
// schema already exists (see engine's database.module.ts comment). Keep
// entity column sets in lockstep regardless (implementation.md §10) —
// migrations don't change that requirement, they just replace how the
// resulting schema gets applied.
const MIGRATIONS_GLOB = [join(__dirname, '..', 'migrations', '*.{js,ts}')];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbType = config.get<string>('DB_TYPE') || 'postgres';

        if (dbType === 'sqljs') {
          return {
            type: 'sqljs' as const,
            autoSave: true,
            location:
              config.get<string>('DB_SQLJS_FILE') || './data/app.sqlite',
            entities: ENTITIES,
            synchronize: true, // sql.js is disposable dev state — safe to sync.
          };
        }

        if (dbType === 'oracle') {
          return {
            type: 'oracle' as const,
            host: config.get<string>('DB_HOST'),
            port: config.get<number>('DB_PORT') || 1521,
            username: config.get<string>('DB_USERNAME'),
            password: config.get<string>('DB_PASSWORD'),
            sid: config.get<string>('DB_ORACLE_SID'),
            entities: ENTITIES,
            migrations: MIGRATIONS_GLOB,
            synchronize: false, // never against Oracle — migrations only.
            migrationsRun: true,
          };
        }

        return {
          type: 'postgres' as const,
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT') || 5432,
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
          entities: ENTITIES,
          migrations: MIGRATIONS_GLOB,
          // Migrations own the Postgres schema now (implementation.md
          // §11) — set DB_SYNCHRONIZE=true only for quick throwaway local
          // experiments where running migrations would be friction.
          synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
          migrationsRun: config.get<string>('DB_SYNCHRONIZE') !== 'true',
        };
      },
    }),
  ],
})
export class DatabaseModule {}
