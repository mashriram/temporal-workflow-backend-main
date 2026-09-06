import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksService } from './webhooks.service';
import { WorkflowRun } from 'src/workflows/entities/workflow-run.entity';
import { WorkflowDefinition } from 'src/workflows/entities/workflow-definition.entity';
import { IntegrationsModule } from 'src/integrations/integrations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowRun, WorkflowDefinition]),
    IntegrationsModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
