import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '@temporalio/client';
import { ApprovalRequest } from './entities/approval-request.entity';
import { WorkflowRun } from '../workflows/entities/workflow-run.entity';
import { AuditLog } from '../audit/entities/audit.entity';

// Must match the engine's hitlApprovalSignal name exactly
// (interpreter.workflow.ts) — Temporal signals are identified by this
// string at the wire level; there's no shared type to enforce it.
const HITL_APPROVAL_SIGNAL_NAME = 'HITL_APPROVAL';

// Redact any field whose key name suggests a secret before a log entry
// ever leaves the backend — implementation.md §11: "the log formatter
// must redact any field the schema marks as secret before it ever reaches
// a log line". This is a blunt, key-name-based net rather than a
// schema-aware one (no per-integration schema is available here), but it
// covers the common cases (Authorization headers, api keys, passwords).
const SECRET_KEY_PATTERN = /pass(word)?|secret|token|api[-_]?key|authorization/i;

function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly repo: Repository<ApprovalRequest>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepo: Repository<WorkflowRun>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @Inject('TEMPORAL_CLIENT') private readonly temporalClient: Client,
  ) {}

  /** A run belongs to whoever owns the WorkflowDefinition it was started
   * from — enforced here since auth (Phase 7) landed after these HITL
   * endpoints were built, and none of them originally checked ownership. */
  private async assertRunOwnership(runId: string, ownerId: string) {
    const run = await this.workflowRunRepo.findOne({
      where: { temporalRunId: runId },
      relations: ['definition'],
    });
    if (!run) {
      throw new NotFoundException(`No WorkflowRun found for Temporal run ${runId}`);
    }
    if (run.definition?.ownerId !== ownerId) {
      throw new ForbiddenException("You don't have access to this workflow run");
    }
    return run;
  }

  async findForRun(runId: string, ownerId: string) {
    await this.assertRunOwnership(runId, ownerId);
    return this.repo.find({ where: { runId }, order: { requestedAt: 'ASC' } });
  }

  /** Story-telling timeline data (implementation.md §9) — raw structured
   * entries; the UI's per-node-type formatter turns these into
   * human-readable lines. Secret-shaped fields are redacted here so no
   * downstream consumer ever has to remember to. */
  async findLogsForRun(runId: string, ownerId: string) {
    await this.assertRunOwnership(runId, ownerId);
    const logs = await this.auditRepo.find({
      where: { workflowRunId: runId },
      order: { timestamp: 'ASC' },
    });
    return logs.map((log) => ({ ...log, details: redact(log.details) }));
  }

  async approve(
    runId: string,
    dto: { nodeId: string; proofFileId?: string; approvedBy: string },
    ownerId: string,
  ) {
    const workflowRun = await this.assertRunOwnership(runId, ownerId);

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
