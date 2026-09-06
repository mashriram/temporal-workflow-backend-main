import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { Client, ScheduleOverlapPolicy } from '@temporalio/client';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { DeployWorkflowDto } from './dto/deploy-workflow.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @Inject('TEMPORAL_CLIENT') private readonly temporalClient: Client,
    @InjectRepository(WorkflowDefinition)
    private readonly workflowsRepository: Repository<WorkflowDefinition>,
    private readonly configService: ConfigService,
  ) {}

  // =================================================================
  // CRUD METHODS (Blueprint Management)
  // =================================================================

  /**
   * Creates a new Workflow Draft.
   */
  async createWorkflow(dto: CreateWorkflowDto) {
    // Using repo.create() is cleaner than new WorkflowDefinition()
    // It automatically maps DTO properties to Entity columns
    const workflow = this.workflowsRepository.create({
      name: dto.name,
      workflowId: `wf_${Date.now()}`,
      nodes: dto.nodes,
      edges: dto.edges,
      status: 'DRAFT', // Initial state
      isActive: false,
      deployedGraph: null, // No execution version yet
    });

    return this.workflowsRepository.save(workflow);
  }

  /**
   * Updates the UI definition (Draft Mode).
   * Does NOT affect the live running version.
   */
  async updateDraft(id: string, nodes: any[], edges: any[]) {
    const workflow = await this.findOne(id);
    if (!workflow) throw new NotFoundException('Workflow not found');

    await this.workflowsRepository.update(
      { id: workflow.id },
      {
        nodes,
        edges,
        status: 'DRAFT', // ✅ Important: Mark as DRAFT because UI changed vs Deployed version
      },
    );
    return { success: true, id: workflow.id };
  }

  async findAll() {
    return this.workflowsRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async findOne(id: string) {
    // Look up by UUID first, fallback to Business ID (wf_...)
    let workflow = await this.workflowsRepository.findOne({ where: { id } });
    if (!workflow) {
      workflow = await this.workflowsRepository.findOne({
        where: { workflowId: id },
      });
    }
    return workflow;
  }

  // =================================================================
  // TEMPORAL / DEPLOYMENT METHODS
  // =================================================================

  /**
   * Deploys a workflow configuration.
   * 1. Updates 'deployedGraph' with the compiled steps.
   * 2. Sets status to 'PUBLISHED' and isActive = true.
   * 3. Configures Temporal (Schedule) if needed.
   */
  async deployWorkflow(dto: DeployWorkflowDto) {
    const { workflowId, steps, startAt, environmentId } = dto;
    this.logger.log(`🚀 Deploying Workflow: ${workflowId}`);

    // 1. Fetch Entity
    const workflow = await this.workflowsRepository.findOne({
      where: { workflowId: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow '${workflowId}' not found`);
    }

    // 2. Analyze Start Node
    const stepValues = Object.values(steps || {});
    const startNode = stepValues.find((n: any) =>
      n.type.startsWith('trigger_'),
    );

    if (!startNode) {
      throw new Error('No Start Node found in workflow definition.');
    }

    // Prepare Execution Snapshot (Casting for JSONB compatibility)
    const executionSnapshot = { steps, startAt } as any;

    // ---------------------------------------------------------
    // CASE A: SCHEDULE / CRON TRIGGER
    // ---------------------------------------------------------
    if (startNode.type === 'trigger_schedule') {
      const cron = String(startNode.params?.cron || '*/15 * * * *');
      const scheduleId = `sched_${workflowId}`;

      this.logger.log(`[Deploy] Configuring Schedule ${scheduleId} (${cron})`);

      try {
        const scheduleHandle =
          this.temporalClient.schedule.getHandle(scheduleId);

        // Delete old schedule to ensure clean update
        try {
          await scheduleHandle.describe();
          this.logger.log('Schedule exists, replacing...');
          await scheduleHandle.delete();
        } catch (e) {
          console.log(`Schedule doesn't exist.. proceeding: ${e}`);
        }

        await this.temporalClient.schedule.create({
          scheduleId: scheduleId,
          spec: { cronExpressions: [cron] },
          action: {
            type: 'startWorkflow',
            workflowType: 'InterpreterWorkflow',
            args: [dto],
            taskQueue: 'agentic-workflow-queue',
            workflowId: `${workflowId}-cron`,
          },
          policies: { overlap: ScheduleOverlapPolicy.SKIP },
        });

        // Update DB
        await this.workflowsRepository.update(
          { workflowId: workflowId },
          {
            status: 'PUBLISHED',
            isActive: true,
            triggerType: 'SCHEDULE',
            cronExpression: cron,
            environmentId: environmentId ?? null,
            deployedGraph: executionSnapshot,
          },
        );

        return {
          success: true,
          status: 'PUBLISHED',
          scheduleId,
          cron,
          workflowId,
          dashboardUrl: this.getTemporalUrl(workflowId),
        };
      } catch (error) {
        this.logger.error('Failed to create Temporal Schedule', error);
        throw error;
      }
    }

    // ---------------------------------------------------------
    // CASE B: WEBHOOK TRIGGER (Passive)
    // ---------------------------------------------------------
    else {
      await this.workflowsRepository.update(
        { workflowId: workflowId },
        {
          status: 'PUBLISHED',
          isActive: true,
          triggerType: 'WEBHOOK',
          cronExpression: null,
          environmentId: environmentId ?? null,
          deployedGraph: executionSnapshot,
        },
      );

      this.logger.log(
        `[Deploy] Webhook Workflow published. Listening at /api/webhooks/${workflowId}`,
      );

      return {
        success: true,
        status: 'PUBLISHED',
        workflowId: workflowId,
        message: `Workflow ready. POST to /api/webhooks/${workflowId}`,
        dashboardUrl: this.getTemporalUrl(workflowId),
      };
    }
  }

  /**
   * Fetches status. Handles 3 scenarios:
   * 1. Running/Completed (Found in Temporal)
   * 2. Just Deployed (Not in Temporal yet -> Return "DEPLOYED")
   * 3. Invalid ID (Not in DB -> Throw 404)
   */
  async getWorkflowStatus(workflowId: string, runId?: string) {
    const handle = this.temporalClient.workflow.getHandle(workflowId, runId);

    try {
      // 1. Try to get status from Temporal
      const [description, nodes] = await Promise.all([
        handle.describe(),
        handle.query('GET_STATUS').catch(() => ({})),
      ]);

      return {
        workflowStatus: description.status.name, // 'RUNNING', 'COMPLETED'
        runId: description.runId,
        nodes: nodes,
      };
    } catch (error) {
      // 2. If Temporal fails, check if it's a valid Webhook Workflow in our DB
      if (error.name === 'WorkflowNotFoundError') {
        const definition = await this.workflowsRepository.findOne({
          where: { workflowId },
        });

        if (definition && definition.triggerType === 'WEBHOOK') {
          // ✅ It is valid, just waiting for the first event
          return {
            workflowStatus: 'DEPLOYED', // Custom status for UI
            runId: null,
            nodes: {}, // No nodes have run yet
          };
        }
      }

      // 3. Genuine Error (Workflow doesn't exist anywhere)
      this.logger.warn(`Execution check failed for ${workflowId}`);
      throw new Error(`Execution not found for ${workflowId}`);
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
