import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '@temporalio/client';
import { ApprovalRequest } from './entities/approval-request.entity';
import { WorkflowRun } from '../workflows/entities/workflow-run.entity';

// Must match the engine's hitlApprovalSignal name exactly
// (interpreter.workflow.ts) — Temporal signals are identified by this
// string at the wire level; there's no shared type to enforce it.
const HITL_APPROVAL_SIGNAL_NAME = 'HITL_APPROVAL';

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly repo: Repository<ApprovalRequest>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepo: Repository<WorkflowRun>,
    @Inject('TEMPORAL_CLIENT') private readonly temporalClient: Client,
  ) {}

  async findForRun(runId: string) {
    return this.repo.find({ where: { runId }, order: { requestedAt: 'ASC' } });
  }

  async approve(
    runId: string,
    dto: { nodeId: string; proofFileId?: string; approvedBy: string },
  ) {
    const approvalRequest = await this.repo.findOne({
      where: { runId, nodeId: dto.nodeId },
    });
    if (!approvalRequest) {
      throw new NotFoundException(
        `No approval request found for run ${runId} / node ${dto.nodeId}`,
      );
    }
    if (approvalRequest.status === 'approved') {
      return approvalRequest; // already resolved — idempotent
    }
    if (approvalRequest.requireProofUpload && !dto.proofFileId) {
      throw new BadRequestException(
        'This approval requires a verification-proof upload before it can be approved.',
      );
    }

    const workflowRun = await this.workflowRunRepo.findOne({
      where: { temporalRunId: runId },
    });
    if (!workflowRun) {
      throw new NotFoundException(`No WorkflowRun found for Temporal run ${runId}`);
    }

    approvalRequest.status = 'approved';
    approvalRequest.resolvedAt = new Date();
    approvalRequest.resolvedBy = dto.approvedBy;
    approvalRequest.proofFileId = dto.proofFileId ?? null;
    await this.repo.save(approvalRequest);

    this.logger.log(
      `[Approvals] Signaling run ${runId} (workflow ${workflowRun.temporalWorkflowId}) ` +
        `for node ${dto.nodeId}, approved by ${dto.approvedBy}`,
    );

    const handle = this.temporalClient.workflow.getHandle(
      workflowRun.temporalWorkflowId,
      runId,
    );
    await handle.signal(HITL_APPROVAL_SIGNAL_NAME, {
      nodeId: dto.nodeId,
      approved: true,
      proofFileId: dto.proofFileId,
      approvedBy: dto.approvedBy,
    });

    return approvalRequest;
  }
}
