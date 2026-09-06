import { Injectable, Inject, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { Client, ScheduleOverlapPolicy } from '@temporalio/client';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { WorkflowVersion } from './entities/workflow-version.entity';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { DeployWorkflowDto } from './dto/deploy-workflow.dto';
import { ConfigService } from '@nestjs/config';
import { IntegrationsService } from 'src/integrations/integrations.service';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @Inject('TEMPORAL_CLIENT') private readonly temporalClient: Client,
    @InjectRepository(WorkflowDefinition)
    private readonly workflowsRepository: Repository<WorkflowDefinition>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepository: Repository<WorkflowRun>,
    @InjectRepository(WorkflowVersion)
    private readonly versionsRepository: Repository<WorkflowVersion>,
    private readonly configService: ConfigService,
    private readonly integrationsService: IntegrationsService,
  ) {}

  // =================================================================
  // CRUD METHODS (Blueprint Management)
  // =================================================================

  /**
   * Creates a new Workflow Draft.
   */
  async createWorkflow(dto: CreateWorkflowDto, ownerId: string) {
    // Using repo.create() is cleaner than new WorkflowDefinition()
    // It automatically maps DTO properties to Entity columns
    const workflow = this.workflowsRepository.create({
      name: dto.name,
      workflowId: `wf_${Date.now()}`,
      nodes: dto.nodes,
      edges: dto.edges,
      tags: dto.tags || [],
      status: 'DRAFT', // Initial state
      isActive: false,
      deployedGraph: null, // No execution version yet
      ownerId,
    });

    const saved = await this.workflowsRepository.save(workflow);
    await this.recordVersion(saved.workflowId, saved.nodes, saved.edges, ownerId);
    return saved;
  }

  /**
   * Updates the UI definition (Draft Mode).
   * Does NOT affect the live running version.
   */
  async updateDraft(
    id: string,
    nodes: any[],
    edges: any[],
    ownerId: string,
    tags?: string[],
  ) {
    const workflow = await this.findOne(id, ownerId);
    if (!workflow) throw new NotFoundException('Workflow not found');

    await this.workflowsRepository.update(
      { id: workflow.id },
      {
        nodes,
        edges,
        status: 'DRAFT', // ✅ Important: Mark as DRAFT because UI changed vs Deployed version
        ...(tags !== undefined ? { tags } : {}),
      },
    );
    await this.recordVersion(workflow.workflowId, nodes, edges, ownerId);
    return { success: true, id: workflow.id };
  }

  async findAll(ownerId: string) {
    return this.workflowsRepository.find({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
    });
  }

  /** Appends an immutable version row — never mutates history (implementation.md §9). */
  private async recordVersion(
    workflowId: string,
    nodes: any[],
    edges: any[],
    createdBy: string | null,
    note?: string,
  ) {
    const last = await this.versionsRepository.findOne({
      where: { workflowId },
      order: { versionNumber: 'DESC' },
    });
    const version = this.versionsRepository.create({
      workflowId,
      versionNumber: (last?.versionNumber || 0) + 1,
      nodes,
      edges,
      createdBy,
      note: note || null,
    });
    return this.versionsRepository.save(version);
  }

  async listVersions(id: string, ownerId: string) {
    const workflow = await this.findOne(id, ownerId);
    if (!workflow) throw new NotFoundException('Workflow not found');
    return this.versionsRepository.find({
      where: { workflowId: workflow.workflowId },
      order: { versionNumber: 'DESC' },
    });
  }

  async restoreVersion(id: string, versionId: string, ownerId: string) {
    const workflow = await this.findOne(id, ownerId);
    if (!workflow) throw new NotFoundException('Workflow not found');

    const version = await this.versionsRepository.findOne({
      where: { id: versionId, workflowId: workflow.workflowId },
    });
    if (!version) throw new NotFoundException('Version not found');

    await this.workflowsRepository.update(
      { id: workflow.id },
      { nodes: version.nodes, edges: version.edges, status: 'DRAFT' },
    );
    await this.recordVersion(
      workflow.workflowId,
      version.nodes,
      version.edges,
      ownerId,
      `Restored from version ${version.versionNumber}`,
    );
    return { success: true, id: workflow.id };
  }

  async exportWorkflow(id: string, ownerId: string) {
    const workflow = await this.findOne(id, ownerId);
    if (!workflow) throw new NotFoundException('Workflow not found');

    const envVarPattern = /\{\{\s*env\.([\w.-]+)\s*\}\}/g;
    const keys = new Set<string>();
    const haystack = JSON.stringify(workflow.nodes);
    let match: RegExpExecArray | null;
    while ((match = envVarPattern.exec(haystack))) {
      keys.add(match[1]);
    }

    return {
      name: workflow.name,
      tags: workflow.tags || [],
      nodes: workflow.nodes,
      edges: workflow.edges,
      environmentVariableKeys: Array.from(keys),
    };
  }

  async importWorkflow(
    dto: { name: string; tags?: string[]; nodes: any[]; edges: any[] },
    ownerId: string,
  ) {
    return this.createWorkflow(
      { name: dto.name, tags: dto.tags, nodes: dto.nodes, edges: dto.edges },
      ownerId,
    );
  }

  /** Home page summary: one row per workflow with its latest run rolled up. */
  async summary(ownerId: string) {
    const workflows = await this.workflowsRepository.find({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
    });

    return Promise.all(
      workflows.map(async (wf) => {
        const [lastRun, runCount] = await Promise.all([
          this.workflowRunRepository.findOne({
            where: { definitionId: wf.id },
            order: { startedAt: 'DESC' },
          }),
          this.workflowRunRepository.count({ where: { definitionId: wf.id } }),
        ]);
        return {
          id: wf.id,
          workflowId: wf.workflowId,
          name: wf.name,
          tags: wf.tags || [],
          status: wf.status,
          isActive: wf.isActive,
          triggerType: wf.triggerType,
          runCount,
          lastRunStatus: lastRun?.status || null,
          lastRunAt: lastRun?.startedAt || null,
          lastRunId: lastRun?.temporalRunId || null,
        };
      }),
    );
  }

  async findOne(id: string, ownerId?: string) {
    // Look up by UUID first, fallback to Business ID (wf_...)
    let workflow = await this.workflowsRepository.findOne({ where: { id } });
    if (!workflow) {
      workflow = await this.workflowsRepository.findOne({
        where: { workflowId: id },
      });
    }
    if (!workflow) return null;
    if (ownerId !== undefined && workflow.ownerId !== ownerId) {
      throw new ForbiddenException("You don't have access to this workflow");
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
  async deployWorkflow(dto: DeployWorkflowDto, ownerId: string) {
    const { workflowId, steps, startAt, environmentId } = dto;
    this.logger.log(`🚀 Deploying Workflow: ${workflowId}`);

    // 1. Fetch Entity
    const workflow = await this.workflowsRepository.findOne({
      where: { workflowId: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow '${workflowId}' not found`);
    }
    if (workflow.ownerId !== ownerId) {
      throw new ForbiddenException("You don't have access to this workflow");
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

        // Snapshotted at schedule-creation time, same as the rest of this
        // action's args — re-deploy the schedule after toggling an
        // integration for a cron-triggered workflow to pick up the change.
        const enabledIntegrations = await this.integrationsService.enabledIds();

        await this.temporalClient.schedule.create({
          scheduleId: scheduleId,
          spec: { cronExpressions: [cron] },
          action: {
            type: 'startWorkflow',
            workflowType: 'InterpreterWorkflow',
            args: [{ ...dto, enabledIntegrations }],
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
   *
   * FIX (Phase 7): this used to call
   * `temporalClient.workflow.getHandle(workflowId, runId)` directly with
   * the *business* workflowId — but webhook-triggered runs' actual
   * Temporal workflow id is `${workflowId}-${uuid}` (see
   * webhooks.service.ts's uniqueRunId), so that handle always 404'd and
   * silently fell back to the fake DEPLOYED/no-runId response, even for a
   * genuinely running workflow. Now resolves the real Temporal
   * workflowId/runId from the WorkflowRun table first.
   */
  async getWorkflowStatus(workflowId: string, runId?: string, ownerId?: string) {
    const definition = await this.workflowsRepository.findOne({
      where: { workflowId },
    });
    if (!definition) {
      throw new NotFoundException(`Workflow '${workflowId}' not found`);
    }
    if (ownerId !== undefined && definition.ownerId !== ownerId) {
      throw new ForbiddenException("You don't have access to this workflow");
    }

    let temporalWorkflowId: string;
    let temporalRunId: string | undefined = runId;

    if (definition.triggerType === 'SCHEDULE') {
      // Schedules reuse one fixed workflowId across every firing.
      temporalWorkflowId = `${workflowId}-cron`;
    } else {
      const run = runId
        ? await this.workflowRunRepository.findOne({
            where: { temporalRunId: runId },
          })
        : await this.workflowRunRepository.findOne({
            where: { definitionId: definition.id },
            order: { startedAt: 'DESC' },
          });

      if (!run) {
        if (definition.triggerType === 'WEBHOOK') {
          // Deployed, but no run has ever been triggered yet.
          return { workflowStatus: 'DEPLOYED', runId: null, nodes: {} };
        }
        throw new Error(`Execution not found for ${workflowId}`);
      }
      temporalWorkflowId = run.temporalWorkflowId;
      temporalRunId = run.temporalRunId;
    }

    const handle = this.temporalClient.workflow.getHandle(
      temporalWorkflowId,
      temporalRunId,
    );

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
        if (definition.triggerType === 'WEBHOOK') {
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
