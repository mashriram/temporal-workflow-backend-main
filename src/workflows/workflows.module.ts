import { Module } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { WorkflowVersion } from './entities/workflow-version.entity';
import { IntegrationsModule } from 'src/integrations/integrations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowDefinition, WorkflowRun, WorkflowVersion]),
    IntegrationsModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
