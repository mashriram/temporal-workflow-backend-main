import {
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

function makeRepo() {
  return {
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve(x)),
  };
}

describe('WebhooksService — per-workflow secret gate (implementation.md §11)', () => {
  let service: WebhooksService;
  let workflowRepo: ReturnType<typeof makeRepo>;
  let workflowRunRepo: ReturnType<typeof makeRepo>;
  let client: { workflow: { start: jest.Mock } };
  let integrationsService: { enabledIds: jest.Mock };
  let configService: { get: jest.Mock };

  const publishedWorkflow = {
    workflowId: 'wf_1',
    isActive: true,
    status: 'PUBLISHED',
    deployedGraph: { startAt: 'start', steps: { start: {} } },
    environmentId: null,
    webhookSecret: 'correct-secret-value',
  };

  beforeEach(() => {
    workflowRepo = makeRepo();
    workflowRunRepo = makeRepo();
    client = {
      workflow: {
        start: jest.fn().mockResolvedValue({ firstExecutionRunId: 'run-1' }),
      },
    };
    integrationsService = { enabledIds: jest.fn().mockResolvedValue(['http']) };
    configService = { get: jest.fn() };

    service = new WebhooksService(
      client as any,
      workflowRepo as any,
      workflowRunRepo as any,
      configService as any,
      integrationsService as any,
    );
  });

  it('rejects a trigger with no secret when one is configured', async () => {
    workflowRepo.findOne.mockResolvedValue(publishedWorkflow);

    await expect(
      service.triggerWebhook(
        'wf_1',
        { body: {}, headers: {}, query: {} },
        undefined,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(client.workflow.start).not.toHaveBeenCalled();
  });

  it('rejects a trigger with the WRONG secret', async () => {
    workflowRepo.findOne.mockResolvedValue(publishedWorkflow);

    await expect(
      service.triggerWebhook(
        'wf_1',
        { body: {}, headers: {}, query: {} },
        'wrong-secret',
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(client.workflow.start).not.toHaveBeenCalled();
  });

  it('accepts a trigger with the correct secret and actually starts the workflow', async () => {
    workflowRepo.findOne.mockResolvedValue(publishedWorkflow);

    const result = await service.triggerWebhook(
      'wf_1',
      { body: { hello: 'world' }, headers: {}, query: {} },
      'correct-secret-value',
    );

    expect(client.workflow.start).toHaveBeenCalledTimes(1);
    expect(result.runId).toBe('run-1');
  });

  it('does not require a secret at all for a workflow that was never (re)deployed since this feature shipped', async () => {
    workflowRepo.findOne.mockResolvedValue({
      ...publishedWorkflow,
      webhookSecret: null,
    });

    const result = await service.triggerWebhook(
      'wf_1',
      { body: {}, headers: {}, query: {} },
      undefined,
    );

    expect(client.workflow.start).toHaveBeenCalledTimes(1);
    expect(result.runId).toBe('run-1');
  });

  it('still 404s for a genuinely nonexistent workflow before ever checking the secret', async () => {
    workflowRepo.findOne.mockResolvedValue(null);

    await expect(
      service.triggerWebhook(
        'wf_missing',
        { body: {}, headers: {}, query: {} },
        'anything',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('still enforces isActive/status checks after the secret passes', async () => {
    workflowRepo.findOne.mockResolvedValue({
      ...publishedWorkflow,
      isActive: false,
    });

    await expect(
      service.triggerWebhook(
        'wf_1',
        { body: {}, headers: {}, query: {} },
        'correct-secret-value',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
