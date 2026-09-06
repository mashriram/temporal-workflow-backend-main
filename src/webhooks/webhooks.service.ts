import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Client, WorkflowIdReusePolicy } from '@temporalio/client';
import { WorkflowDefinition } from 'src/workflows/entities/workflow-definition.entity';
import { WorkflowRun } from 'src/workflows/entities/workflow-run.entity';
import { WebhookContext } from './webhooks.types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject('TEMPORAL_CLIENT') private readonly client: Client,
    @InjectRepository(WorkflowDefinition)
    private readonly workflowRepo: Repository<WorkflowDefinition>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepo: Repository<WorkflowRun>,
    private readonly configService: ConfigService,
  ) {}

  async triggerWebhook(workflowId: string, context: WebhookContext) {
    this.logger.log(`[Webhook] Processing trigger for: ${workflowId}`);

    // 1. Fetch & Validate Definition
    const definition = await this.workflowRepo.findOne({
      where: { workflowId: workflowId },
    });

    if (!definition) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    if (!definition.isActive) {
      throw new BadRequestException('Workflow is inactive');
    }

    if (definition.status !== 'PUBLISHED') {
      throw new BadRequestException('Workflow is not published');
    }

    const graph = definition.deployedGraph;
    if (!graph || !graph.startAt || !graph.steps) {
      this.logger.error(`[Webhook] Corrupted deployment for ${workflowId}`);
      throw new InternalServerErrorException(
        'Workflow deployment data is corrupted',
      );
    }

    // 2. Prepare Temporal Payload
    const uniqueRunId = `${workflowId}-${uuidv4()}`;
    const runtimePayload = {
      workflowId: definition.workflowId,
      startAt: graph.startAt,
      steps: graph.steps,
      environmentId: definition.environmentId ?? undefined,
      initialState: {
        [graph.startAt]: {
          ...context,
          timestamp: new Date().toISOString(),
        },
      },
    };

    try {
      // 3. Start Temporal Workflow
      const handle = await this.client.workflow.start('InterpreterWorkflow', {
        args: [runtimePayload],
        taskQueue: 'agentic-workflow-queue',
        workflowId: uniqueRunId,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      });

      this.logger.log(
        `[Webhook] Started Temporal RunID: ${handle.firstExecutionRunId}`,
      );

      // 4. Save Execution History
      const workflowRun = this.workflowRunRepo.create({
        temporalWorkflowId: uniqueRunId,
        temporalRunId: handle.firstExecutionRunId,
        status: 'RUNNING',
        input: context,
        startedAt: new Date(),
        definition: definition,
        environmentId: definition.environmentId ?? null,
      });

      await this.workflowRunRepo.save(workflowRun);

      return {
        success: true,
        workflowId,
        runId: handle.firstExecutionRunId,
        status: 'RUNNING',
        traceUrl: this.getTemporalUrl(workflowId, handle.firstExecutionRunId),
      };
    } catch (error) {
      this.logger.error(`[Webhook] Error starting ${workflowId}`, error);
      throw new InternalServerErrorException(
        'Failed to start workflow execution',
      );
    }
  }
  private getTemporalUrl(workflowId: string, runId?: string) {
    const baseUrl =
      this.configService.get('TEMPORAL_UI_URL') || 'http://localhost:8233';
    const namespace = this.configService.get('TEMPORAL_NAMESPACE') || 'default';

    // Link to specific Run
    if (runId) {
      return `${baseUrl}/namespaces/${namespace}/workflows/${workflowId}/${runId}/history`;
    }

    // Link to Workflow Filter (List of all runs for this ID)
    return `${baseUrl}/namespaces/${namespace}/workflows?query=WorkflowId="${workflowId}"`;
  }
}
