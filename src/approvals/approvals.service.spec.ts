import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalsService } from './approvals.service';

function makeRepo() {
  return { find: jest.fn(), findOne: jest.fn(), save: jest.fn((x) => x) };
}

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let approvalRepo: ReturnType<typeof makeRepo>;
  let workflowRunRepo: ReturnType<typeof makeRepo>;
  let auditRepo: ReturnType<typeof makeRepo>;
  let temporalClient: { workflow: { getHandle: jest.Mock } };

  const ownedRun = {
    temporalWorkflowId: 'wf_1-uuid',
    definition: { ownerId: 'user-a' },
  };

  beforeEach(() => {
    approvalRepo = makeRepo();
    workflowRunRepo = makeRepo();
    auditRepo = makeRepo();
    temporalClient = { workflow: { getHandle: jest.fn() } };

    service = new ApprovalsService(
      approvalRepo as any,
      workflowRunRepo as any,
      auditRepo as any,
      temporalClient as any,
    );
  });

  describe(
    "run-ownership check (added retroactively once auth landed — Phase 6's " +
      'HITL endpoints were built before auth existed and had none)',
    () => {
      it('rejects viewing approval requests for a run owned by another user', async () => {
        workflowRunRepo.findOne.mockResolvedValue(ownedRun);
        await expect(service.findForRun('run-1', 'user-b')).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('rejects viewing logs for a run owned by another user', async () => {
        workflowRunRepo.findOne.mockResolvedValue(ownedRun);
        await expect(service.findLogsForRun('run-1', 'user-b')).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('rejects approving a run owned by another user', async () => {
        workflowRunRepo.findOne.mockResolvedValue(ownedRun);
        await expect(
          service.approve(
            'run-1',
            { nodeId: 'gate', approvedBy: 'eve' },
            'user-b',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('allows the owning user through to normal validation', async () => {
        workflowRunRepo.findOne.mockResolvedValue(ownedRun);
        approvalRepo.find.mockResolvedValue([]);
        const result = await service.findForRun('run-1', 'user-a');
        expect(result).toEqual([]);
      });

      it('throws NotFoundException when the run does not exist at all', async () => {
        workflowRunRepo.findOne.mockResolvedValue(null);
        await expect(
          service.findForRun('nonexistent-run', 'user-a'),
        ).rejects.toThrow(NotFoundException);
      });
    },
  );

  describe('approve()', () => {
    it('rejects approval without proof when requireProofUpload is set', async () => {
      workflowRunRepo.findOne.mockResolvedValue(ownedRun);
      approvalRepo.findOne.mockResolvedValue({
        runId: 'run-1',
        nodeId: 'gate',
        status: 'pending',
        requireProofUpload: true,
      });

      await expect(
        service.approve(
          'run-1',
          { nodeId: 'gate', approvedBy: 'alice' },
          'user-a',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(temporalClient.workflow.getHandle).not.toHaveBeenCalled();
    });

    it('is idempotent — approving an already-approved request is a no-op, not an error', async () => {
      workflowRunRepo.findOne.mockResolvedValue(ownedRun);
      const alreadyApproved = {
        runId: 'run-1',
        nodeId: 'gate',
        status: 'approved',
        resolvedBy: 'alice',
      };
      approvalRepo.findOne.mockResolvedValue(alreadyApproved);

      const result = await service.approve(
        'run-1',
        { nodeId: 'gate', approvedBy: 'bob' },
        'user-a',
      );

      expect(result).toBe(alreadyApproved);
      expect(temporalClient.workflow.getHandle).not.toHaveBeenCalled();
    });

    it('signals the correct Temporal workflow with approved:true on valid approval', async () => {
      workflowRunRepo.findOne.mockResolvedValue(ownedRun);
      approvalRepo.findOne.mockResolvedValue({
        runId: 'run-1',
        nodeId: 'gate',
        status: 'pending',
        requireProofUpload: false,
      });
      const mockHandle = { signal: jest.fn().mockResolvedValue(undefined) };
      temporalClient.workflow.getHandle.mockReturnValue(mockHandle);

      await service.approve(
        'run-1',
        { nodeId: 'gate', approvedBy: 'alice', proofFileId: 'f1' },
        'user-a',
      );

      expect(temporalClient.workflow.getHandle).toHaveBeenCalledWith(
        'wf_1-uuid',
        'run-1',
      );
      expect(mockHandle.signal).toHaveBeenCalledWith('HITL_APPROVAL', {
        nodeId: 'gate',
        approved: true,
        proofFileId: 'f1',
        approvedBy: 'alice',
      });
    });

    it('throws NotFoundException if no approval request exists for that node', async () => {
      workflowRunRepo.findOne.mockResolvedValue(ownedRun);
      approvalRepo.findOne.mockResolvedValue(null);

      await expect(
        service.approve(
          'run-1',
          { nodeId: 'no-such-node', approvedBy: 'alice' },
          'user-a',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findLogsForRun — secret redaction', () => {
    it('redacts secret-shaped keys (password/secret/token/api key/authorization) before returning', async () => {
      workflowRunRepo.findOne.mockResolvedValue(ownedRun);
      auditRepo.find.mockResolvedValue([
        {
          id: 'l1',
          nodeId: 'call',
          details: {
            params: {
              url: 'https://x',
              headers: { Authorization: 'Bearer real-secret-token' },
            },
          },
        },
        {
          id: 'l2',
          nodeId: 'call2',
          details: { output: { apiKey: 'sk-real-key', ok: true } },
        },
      ]);

      const logs = await service.findLogsForRun('run-1', 'user-a');

      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain('real-secret-token');
      expect(serialized).not.toContain('sk-real-key');
      expect(logs[0].details.params.headers.Authorization).toBe('[REDACTED]');
      expect(logs[1].details.output.apiKey).toBe('[REDACTED]');
      // Non-secret fields must survive redaction untouched.
      expect(logs[0].details.params.url).toBe('https://x');
      expect(logs[1].details.output.ok).toBe(true);
    });
  });
});
