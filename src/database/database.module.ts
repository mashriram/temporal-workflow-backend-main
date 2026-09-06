import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WorkflowDefinition } from '../workflows/entities/workflow-definition.entity';
import { WorkflowRun } from '../workflows/entities/workflow-run.entity';
import { AuditLog } from '../audit/entities/audit.entity';
import { Environment } from '../environments/entities/environment.entity';
import { EnvironmentVariable } from '../environments/entities/environment-variable.entity';

const ENTITIES = [
  WorkflowDefinition,
  WorkflowRun,
  AuditLog,
  Environment,
  EnvironmentVariable,
];

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
            location: config.get<string>('DB_SQLJS_FILE') || './data/app.sqlite',
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
            synchronize: false, // never against Oracle — use migrations.
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
          // Disposable personal-dev Postgres only; real deployments should
          // move to migrations once persisted data actually matters.
          synchronize: config.get<string>('NODE_ENV') !== 'production',
        };
      },
    }),
  ],
})
export class DatabaseModule {}
