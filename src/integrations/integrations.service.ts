import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationConfig } from './entities/integration-config.entity';
import { KNOWN_INTEGRATIONS } from './known-integrations';

@Injectable()
export class IntegrationsService implements OnModuleInit {
  constructor(
    @InjectRepository(IntegrationConfig)
    private readonly repo: Repository<IntegrationConfig>,
  ) {}

  // Idempotent seed: insert a row for any known integration that doesn't
  // have one yet. Safe to run on every boot — never overwrites an existing
  // row's enabled/settings (a user's toggle choice must survive restarts).
  async onModuleInit() {
    const existingIds = new Set((await this.repo.find()).map((r) => r.id));
    const missing = KNOWN_INTEGRATIONS.filter((k) => !existingIds.has(k.id));
    if (missing.length === 0) return;

    await this.repo.save(
      missing.map((k) =>
        this.repo.create({
          id: k.id,
          label: k.label,
          enabled: k.defaultEnabled,
          settings: null,
        }),
      ),
    );
  }

  async findAll() {
    const rows = await this.repo.find();
    return rows.map((row) => this.withMissingConfig(row));
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Integration '${id}' not found`);
    return this.withMissingConfig(row);
  }

  async update(id: string, dto: { enabled?: boolean; settings?: Record<string, any> }) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Integration '${id}' not found`);
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.settings !== undefined) row.settings = dto.settings;
    await this.repo.save(row);
    return this.withMissingConfig(row);
  }

  /** ids of every currently-enabled integration — what the engine's
   * ToolRegistry.build() and the UI's registry filter both consume. */
  async enabledIds(): Promise<string[]> {
    const rows = await this.repo.find({ where: { enabled: true } });
    return rows.map((r) => r.id);
  }

  private withMissingConfig(row: IntegrationConfig) {
    const known = KNOWN_INTEGRATIONS.find((k) => k.id === row.id);
    const requiredEnvVars = known?.requiredEnvVars ?? [];
    const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
    return {
      ...row,
      requiredEnvVars,
      missingEnvVars,
      configNote: known?.configNote,
    };
  }
}
