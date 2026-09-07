import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

@Controller('workflow-runs')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get(':runId/approval-requests')
  findForRun(
    @Param('runId') runId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.approvalsService.findForRun(runId, user.id);
  }

  @Post(':runId/approve')
  approve(
    @Param('runId') runId: string,
    @Body() dto: { nodeId: string; proofFileId?: string; approvedBy: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.approvalsService.approve(runId, dto, user.id);
  }

  @Get(':runId/logs')
  logs(@Param('runId') runId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.approvalsService.findLogsForRun(runId, user.id);
  }
}
