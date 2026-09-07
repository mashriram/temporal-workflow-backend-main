import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Client, WorkflowIdReusePolicy } from '@temporalio/client';
import { WorkflowDefinition } from 'src/workflows/entities/workflow-definition.entity';
import { WorkflowRun } from 'src/workflows/entities/workflow-run.entity';
import { WebhookContext } from './webhooks.types';
import { ConfigService } from '@nestjs/config';
import { IntegrationsService } from 'src/integrations/integrations.service';

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
    private readonly integrationsService: IntegrationsService,
  ) {}

  async triggerWebhook(
    workflowId: string,
    context: WebhookContext,
    providedSecret: string | undefined,
  ) {
    this.logger.log(`[Webhook] Processing trigger for: ${workflowId}`);

    // 1. Fetch & Validate Definition
    const definition = await this.workflowRepo.findOne({
      where: { workflowId: workflowId },
    });

    if (!definition) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    // Per-workflow secret (implementation.md §11) — this endpoint is
    // necessarily @Public() since it's called by external systems with
    // no user token, so this is the actual access control. Constant-time
    // compare to avoid a timing side-channel on the secret.
    if (definition.webhookSecret) {
      const expected = Buffer.from(definition.webhookSecret);
      const provided = Buffer.from(providedSecret || '');
      const valid =
        expected.length === provided.length &&
        timingSafeEqual(expected, provided);
      if (!valid) {
        throw new UnauthorizedException('Invalid or missing webhook secret');
      }
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
    const enabledIntegrations = await this.integrationsService.enabledIds();
    const runtimePayload = {
      workflowId: definition.workflowId,
      startAt: graph.startAt,
      steps: graph.steps,
      environmentId: definition.environmentId ?? undefined,
      enabledIntegrations,
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
