import { Controller, Post, Param, Body, Headers, Query } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import type { IncomingHttpHeaders } from 'http';
import { Public } from '../auth/decorators/public.decorator';

// Called by external systems (or curl during dev), never by a logged-in
// browser user — exempt from the global JwtAuthGuard. Per implementation.md
// §9 this should eventually carry a per-workflow webhook secret instead;
// not yet built (see Phase 8+ production-readiness checklist).
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post(':workflowId')
  async triggerWebhook(
    @Param('workflowId') workflowId: string,

    // Type: A generic JSON object
    @Body() body: Record<string, any>,

    // Type: Standard HTTP Headers (string | string[])
    @Headers() headers: IncomingHttpHeaders,

    // Type: Query params are typically key-value strings
    @Query() query: Record<string, string>,
  ) {
    return this.webhooksService.triggerWebhook(workflowId, {
      body,
      headers,
      query,
    });
  }
}
