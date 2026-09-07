import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Client } from '@temporalio/client';
import { Public } from '../auth/decorators/public.decorator';

// Called by whatever process/container orchestration exists in prod — no
// container orchestrator health-check convention to lean on by default
// (implementation.md §11), so this exists regardless of deployment target.
// @Public(): infra probes carry no user token.
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject('TEMPORAL_CLIENT') private readonly temporalClient: Client,
  ) {}

  @Public()
  @Get()
  async check(@Res() res: Response) {
    const [db, temporal] = await Promise.all([
      this.checkDb(),
      this.checkTemporal(),
    ]);

    const healthy = db.ok && temporal.ok;
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: healthy ? 'ok' : 'error',
      db,
      temporal,
      timestamp: new Date().toISOString(),
    });
  }

  private async checkDb(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  private async checkTemporal(): Promise<{ ok: boolean; error?: string }> {
    try {
      // Documented health-check primitive: calls GetSystemInfo internally
      // and memoizes the result once a connection is confirmed.
      await this.temporalClient.connection.ensureConnected();
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }
}
