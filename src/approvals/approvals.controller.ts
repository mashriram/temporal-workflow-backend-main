import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';

@Controller('workflow-runs')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get(':runId/approval-requests')
  findForRun(@Param('runId') runId: string) {
    return this.approvalsService.findForRun(runId);
  }

  @Post(':runId/approve')
  approve(
    @Param('runId') runId: string,
    @Body() dto: { nodeId: string; proofFileId?: string; approvedBy: string },
  ) {
    return this.approvalsService.approve(runId, dto);
  }
}
