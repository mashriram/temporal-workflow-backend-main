import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { WorkflowsModule } from './workflows/workflows.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { TemporalModule } from './temporal/temporal.module';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { AuditModule } from './audit/audit.module';
import { CommonModule } from './common/common.module';
import { VoiceModule } from './voice/voice.module';
import { DatabaseModule } from './database/database.module';
import { EnvironmentsModule } from './environments/environments.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { DependencyInferenceModule } from './workflows/dependency-inference/dependency-inference.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { UploadsModule } from './uploads/uploads.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',

      validationSchema: validationSchema,
    }),
    // Global default: generous enough for normal UI polling
    // (useWorkflowStatus polls every 5s). Auth and webhooks apply their
    // own stricter @Throttle() overrides directly on those controllers.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    WorkflowsModule,
    WebhooksModule,
    TemporalModule,
    AuditModule,
    CommonModule,
    VoiceModule,
    EnvironmentsModule,
    IntegrationsModule,
    DependencyInferenceModule,
    ApprovalsModule,
    UploadsModule,
    AuthModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    // Order matters: rate-limit first (cheap, protects against floods
    // regardless of auth outcome), then the JWT check.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
