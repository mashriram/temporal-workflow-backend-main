import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Environment } from './entities/environment.entity';
import { EnvironmentVariable } from './entities/environment-variable.entity';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpsertVariableDto } from './dto/upsert-variable.dto';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';

const DEFAULT_REFRESH_SKEW_SECONDS = 60;
// Guards against a user accidentally wiring a variable's refresh config to
// reference itself (directly or via a short chain) — never hang forever.
const MAX_TEMPLATE_RESOLUTION_DEPTH = 5;

@Injectable()
export class EnvironmentsService {
  private readonly logger = new Logger(EnvironmentsService.name);

  constructor(
    @InjectRepository(Environment)
    private readonly environmentRepo: Repository<Environment>,
    @InjectRepository(EnvironmentVariable)
    private readonly variableRepo: Repository<EnvironmentVariable>,
    private readonly cipher: SecretCipherService,
  ) {}

  // =================================================================
  // CRUD
  // =================================================================

  async create(dto: CreateEnvironmentDto) {
    const env = this.environmentRepo.create({ name: dto.name });
    return this.environmentRepo.save(env);
  }

  /**
   * List endpoint used by the UI (environment picker + manager sidebar).
   * MUST go through redaction like findOneRedacted() — this used to return
   * raw entities, which leaked encrypted secret ciphertext (and broke the
   * `hasValue`-driven masking UI, since that field only exists on the
   * redacted shape) to the client. Never call environmentRepo.find()
   * directly from a controller-facing method again.
   */
  async findAll() {
    const envs = await this.environmentRepo.find({
      relations: ['variables'],
      order: { createdAt: 'ASC' },
    });
    return envs.map((env) => this.redactEnvironment(env));
  }

  async findOne(id: string) {
    const env = await this.environmentRepo.findOne({
      where: { id },
      relations: ['variables'],
    });
    if (!env) throw new NotFoundException(`Environment ${id} not found`);
    return env;
  }

  /** Same as findOne(), but never leaks decrypted secret values to the UI. */
  async findOneRedacted(id: string) {
    const env = await this.findOne(id);
    return this.redactEnvironment(env);
  }

  private redactEnvironment(env: Environment) {
    return {
      ...env,
      variables: env.variables.map((v) => this.redactVariable(v)),
    };
  }

  async remove(id: string) {
    const env = await this.findOne(id);
    await this.environmentRepo.remove(env);
    return { success: true };
  }

  async upsertVariable(environmentId: string, dto: UpsertVariableDto) {
    const env = await this.findOne(environmentId);

    let variable: EnvironmentVariable | undefined;
    if (dto.id) {
      variable = env.variables.find((v) => v.id === dto.id);
      if (!variable) {
        throw new NotFoundException(`Variable ${dto.id} not found`);
      }
    } else {
      variable = this.variableRepo.create({ environmentId });
    }

    variable.key = dto.key;
    variable.kind = dto.kind;

    if (dto.kind === 'auto_refresh_token') {
      variable.value = null;
      variable.refreshConfig = dto.refreshConfig ?? null;
      // Changing the refresh recipe invalidates any cached token.
      variable.cachedValue = null;
      variable.cachedExpiresAtMs = null;
    } else {
      variable.refreshConfig = null;
      variable.value =
        dto.kind === 'secret'
          ? this.cipher.encrypt(dto.value as string)
          : (dto.value ?? null);
    }

    const saved = await this.variableRepo.save(variable);
    return this.redactVariable(saved);
  }

  async removeVariable(environmentId: string, variableId: string) {
    const variable = await this.variableRepo.findOne({
      where: { id: variableId, environmentId },
    });
    if (!variable) throw new NotFoundException(`Variable ${variableId} not found`);
    await this.variableRepo.remove(variable);
    return { success: true };
  }

  private redactVariable(v: EnvironmentVariable) {
    const isSecret = v.kind === 'secret';
    const isAutoRefresh = v.kind === 'auto_refresh_token';
    return {
      id: v.id,
      environmentId: v.environmentId,
      key: v.key,
      kind: v.kind,
      value: isSecret ? null : isAutoRefresh ? null : v.value,
      hasValue: isSecret ? !!v.value : undefined,
      refreshConfig: isAutoRefresh ? v.refreshConfig : undefined,
      hasCachedToken: isAutoRefresh ? !!v.cachedValue : undefined,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }

  // =================================================================
  // RESOLUTION (used at deploy/run time by the engine's resolveEnvVar
  // Activity, over HTTP — see /environments/:id/resolve below)
  // =================================================================

  async resolveVariable(
    environmentId: string,
    key: string,
    depth = 0,
  ): Promise<string | null> {
    const variable = await this.variableRepo.findOne({
      where: { environmentId, key },
    });
    if (!variable) return null;

    if (variable.kind === 'static') {
      return variable.value;
    }

    if (variable.kind === 'secret') {
      return variable.value ? this.cipher.decrypt(variable.value) : null;
    }

    // auto_refresh_token
    return this.resolveAutoRefreshToken(variable, depth);
  }

  private async resolveAutoRefreshToken(
    variable: EnvironmentVariable,
    depth: number,
  ): Promise<string | null> {
    const now = Date.now();
    const skewMs =
      (variable.refreshConfig?.refreshSkewSeconds ??
        DEFAULT_REFRESH_SKEW_SECONDS) * 1000;

    if (
      variable.cachedValue &&
      variable.cachedExpiresAtMs &&
      Number(variable.cachedExpiresAtMs) - skewMs > now
    ) {
      return variable.cachedValue;
    }

    const refreshConfig = variable.refreshConfig;
    if (!refreshConfig) {
      throw new BadRequestException(
        `Variable '${variable.key}' is an auto_refresh_token with no refreshConfig`,
      );
    }

    const fresh = await this.refreshToken(
      variable.environmentId,
      refreshConfig,
      depth,
    );

    variable.cachedValue = fresh;
    variable.cachedExpiresAtMs = String(
      now + refreshConfig.ttlSeconds * 1000,
    );
    await this.variableRepo.save(variable);

    return fresh;
  }

  private async refreshToken(
    environmentId: string,
    config: NonNullable<EnvironmentVariable['refreshConfig']>,
    depth: number,
  ): Promise<string> {
    this.logger.log(`[Environments] Refreshing token via ${config.url}`);

    const url = await this.resolveTemplate(environmentId, config.url, depth);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(config.headers || {})) {
      headers[k] = await this.resolveTemplate(environmentId, v, depth);
    }
    const body = config.body
      ? await this.resolveTemplate(environmentId, config.body, depth)
      : undefined;

    try {
      const response = await axios.request({
        method: config.method,
        url,
        headers,
        data: body,
      });

      const token = getByPath(response.data, config.tokenPath);
      if (token === undefined || token === null) {
        throw new Error(
          `Refresh response had nothing at path '${config.tokenPath}'`,
        );
      }
      return String(token);
    } catch (error) {
      this.logger.error(
        `[Environments] Token refresh failed for ${config.url}`,
        error,
      );
      throw new BadRequestException(
        `Token refresh request failed: ${error.message || error}`,
      );
    }
  }

  /** Resolves {{env.OTHER_KEY}} placeholders inside a refresh-config field. */
  private async resolveTemplate(
    environmentId: string,
    template: string,
    depth: number,
  ): Promise<string> {
    if (!template) return template;
    if (depth >= MAX_TEMPLATE_RESOLUTION_DEPTH) {
      throw new BadRequestException(
        'Environment variable template resolution exceeded max depth ' +
          '(likely a circular reference between variables)',
      );
    }

    const matches = [...template.matchAll(/\{\{\s*env\.(.*?)\s*\}\}/g)];
    let result = template;
    for (const m of matches) {
      const value = await this.resolveVariable(environmentId, m[1], depth + 1);
      result = result.replace(m[0], value ?? '');
    }
    return result;
  }
}

function getByPath(obj: any, path: string): unknown {
  return path
    .split('.')
    .reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}
