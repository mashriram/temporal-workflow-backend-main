import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // Public: this is also the exact endpoint the engine's WorkerService
  // polls at boot (loadEnabledIntegrations) to build ToolRegistry — that
  // request carries no user token. The UI's Settings page calls this too,
  // as an anonymous/browsing read; only mutation (update, below) needs a
  // logged-in user.
  @Public()
  @Get()
  findAll() {
    return this.integrationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.integrationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { enabled?: boolean; settings?: Record<string, any> },
  ) {
    return this.integrationsService.update(id, dto);
  }
}
