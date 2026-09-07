import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

function makeRepo() {
  return {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 'saved-id', ...x })),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    count: jest.fn(),
  };
}

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let workflowsRepo: ReturnType<typeof makeRepo>;
  let workflowRunRepo: ReturnType<typeof makeRepo>;
  let versionsRepo: ReturnType<typeof makeRepo>;
  let temporalClient: { workflow: { getHandle: jest.Mock } };
  let configService: { get: jest.Mock };
  let integrationsService: { enabledIds: jest.Mock };

  beforeEach(() => {
    workflowsRepo = makeRepo();
    workflowRunRepo = makeRepo();
    versionsRepo = makeRepo();
    temporalClient = {
      workflow: { getHandle: jest.fn() },
    };
    configService = { get: jest.fn() };
    integrationsService = { enabledIds: jest.fn().mockResolvedValue(['http']) };

    service = new WorkflowsService(
      temporalClient as any,
      workflowsRepo as any,
      workflowRunRepo as any,
      versionsRepo as any,
      configService as any,
      integrationsService as any,
    );
  });

  describe('ownership scoping', () => {
    it('findOne returns the workflow when ownerId matches', async () => {
      workflowsRepo.findOne.mockResolvedValueOnce({
        id: 'w1',
        workflowId: 'wf_1',
        ownerId: 'user-a',
      });

      const result = await service.findOne('w1', 'user-a');
      expect(result?.id).toBe('w1');
    });

    it('findOne throws ForbiddenException when a DIFFERENT user owns it', async () => {
      workflowsRepo.findOne.mockResolvedValueOnce({
        id: 'w1',
        workflowId: 'wf_1',
        ownerId: 'user-a',
      });

      await expect(service.findOne('w1', 'user-b')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('findOne returns null (not Forbidden) when the row genuinely does not exist', async () => {
      workflowsRepo.findOne.mockResolvedValue(null);
      const result = await service.findOne('nonexistent', 'user-a');
      expect(result).toBeNull();
    });

    it('findAll scopes the query to the given ownerId', async () => {
      workflowsRepo.find.mockResolvedValue([]);
      await service.findAll('user-a');
      expect(workflowsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 'user-a' } }),
      );
    });

    it("createWorkflow stamps the new row with the creating user's id", async () => {
      versionsRepo.findOne.mockResolvedValue(null);
      const result = await service.createWorkflow(
        { name: 'Test', nodes: [], edges: [] },
        'user-a',
      );
      expect(workflowsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'user-a' }),
      );
      expect(result.ownerId).toBe('user-a');
    });

    it('createWorkflow records version 1 of the new workflow', async () => {
      versionsRepo.findOne.mockResolvedValue(null);
      const result = await service.createWorkflow(
        { name: 'Test', nodes: [{ id: 'n1' }] as any, edges: [] },
        'user-a',
      );
      expect(versionsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: result.workflowId,
          versionNumber: 1,
          nodes: [{ id: 'n1' }],
        }),
      );
    });

    it('deployWorkflow rejects deploying a workflow owned by someone else', async () => {
      workflowsRepo.findOne.mockResolvedValue({
        id: 'w1',
        workflowId: 'wf_1',
        ownerId: 'user-a',
      });

      await expect(
        service.deployWorkflow(
          {
            id: 'w1',
            workflowId: 'wf_1',
            startAt: 'start',
            steps: {
              start: {
                id: 'start',
                name: 'Start',
                type: 'trigger_start',
                params: {},
              },
            },
          } as any,
          'user-b',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getWorkflowStatus — regression test for the business-vs-Temporal workflowId bug', () => {
    it(
      'resolves the REAL Temporal workflowId/runId from the WorkflowRun table ' +
        'instead of calling getHandle with the bare business workflowId ' +
        '(the original bug: webhook runs are named `${workflowId}-${uuid}` in ' +
        'Temporal, so getHandle(businessWorkflowId) always 404s)',
      async () => {
        workflowsRepo.findOne.mockResolvedValue({
          id: 'w1',
          workflowId: 'wf_1',
          ownerId: 'user-a',
          triggerType: 'WEBHOOK',
        });
        workflowRunRepo.findOne.mockResolvedValue({
          temporalWorkflowId: 'wf_1-abc-uuid',
          temporalRunId: 'run-xyz',
        });

        const mockHandle = {
          describe: jest.fn().mockResolvedValue({
            status: { name: 'RUNNING' },
            runId: 'run-xyz',
          }),
          query: jest.fn().mockResolvedValue({}),
        };
        temporalClient.workflow.getHandle.mockReturnValue(mockHandle);

        const result = await service.getWorkflowStatus(
          'wf_1',
          undefined,
          'user-a',
        );

        // The critical assertion: getHandle must be called with the REAL
        // Temporal workflow id, never the bare business workflowId.
        expect(temporalClient.workflow.getHandle).toHaveBeenCalledWith(
          'wf_1-abc-uuid',
          'run-xyz',
        );
        expect(result.workflowStatus).toBe('RUNNING');
      },
    );

    it('returns a DEPLOYED fallback when a WEBHOOK workflow has never been run', async () => {
      workflowsRepo.findOne.mockResolvedValue({
        id: 'w1',
        workflowId: 'wf_1',
        ownerId: 'user-a',
        triggerType: 'WEBHOOK',
      });
      workflowRunRepo.findOne.mockResolvedValue(null);

      const result = await service.getWorkflowStatus(
        'wf_1',
        undefined,
        'user-a',
      );

      expect(result).toEqual({
        workflowStatus: 'DEPLOYED',
        runId: null,
        nodes: {},
      });
      expect(temporalClient.workflow.getHandle).not.toHaveBeenCalled();
    });

    it("rejects checking another user's workflow status", async () => {
      workflowsRepo.findOne.mockResolvedValue({
        id: 'w1',
        workflowId: 'wf_1',
        ownerId: 'user-a',
        triggerType: 'WEBHOOK',
      });

      await expect(
        service.getWorkflowStatus('wf_1', undefined, 'user-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for a workflowId that does not exist at all', async () => {
      workflowsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getWorkflowStatus('wf_missing', undefined, 'user-a'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportWorkflow', () => {
    it('scrapes {{env.KEY}} variable NAMES only, never resolves values', async () => {
      workflowsRepo.findOne.mockResolvedValue({
        id: 'w1',
        workflowId: 'wf_1',
        ownerId: 'user-a',
        name: 'Test',
        tags: ['a'],
        nodes: [
          { data: { config: { url: 'https://x/{{env.API_HOST}}' } } },
          {
            data: {
              config: { headers: '{"Authorization":"{{env.API_KEY}}"}' },
            },
          },
        ],
        edges: [],
      });

      const result = await service.exportWorkflow('w1', 'user-a');

      expect(result.environmentVariableKeys.sort()).toEqual([
        'API_HOST',
        'API_KEY',
      ]);
      expect(JSON.stringify(result)).not.toMatch(/secret|password/i);
    });
  });

  describe('summary', () => {
    it('includes lastRunId for the Home page "View run" link', async () => {
      workflowsRepo.find.mockResolvedValue([
        {
          id: 'w1',
          workflowId: 'wf_1',
          name: 'Test',
          tags: [],
          status: 'PUBLISHED',
          isActive: true,
          triggerType: 'WEBHOOK',
        },
      ]);
      workflowRunRepo.findOne.mockResolvedValue({
        status: 'COMPLETED',
        startedAt: new Date('2026-01-01'),
        temporalRunId: 'run-abc',
      });
      workflowRunRepo.count.mockResolvedValue(3);

      const result = await service.summary('user-a');

      expect(result[0].lastRunId).toBe('run-abc');
      expect(result[0].runCount).toBe(3);
    });
  });
});
