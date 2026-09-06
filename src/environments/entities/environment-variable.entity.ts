import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Environment } from './environment.entity';

export type EnvironmentVariableKind =
  | 'static'
  | 'secret'
  | 'auto_refresh_token';

// User-defined recipe for a variable whose value is a bearer token that
// expires and must be transparently refreshed (e.g. every 30 minutes).
// Every field here is itself user-configurable — nothing about "which
// endpoint", "which field of the response", or "how long it lasts" is
// hardcoded anywhere in the platform.
export interface AutoRefreshTokenConfig {
  method: 'GET' | 'POST';
  url: string; // may itself contain {{env.OTHER_VAR}}
  headers?: Record<string, string>;
  body?: string;
  tokenPath: string; // dot-path into the JSON response, e.g. 'access_token'
  ttlSeconds: number; // e.g. 1800 for a 30-minute token
  refreshSkewSeconds?: number; // refresh this many seconds early, default 60
}

@Entity('environment_variables')
export class EnvironmentVariable {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  @ManyToOne(() => Environment, (e) => e.variables, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'environmentId' })
  environment: Environment;

  @Column()
  environmentId: string;

  @Column()
  key: string; // free-form, e.g. 'AUTH_REFRESH_URL'

  @Column({ default: 'static' })
  kind: EnvironmentVariableKind;

  // 'static': plain value. 'secret': encrypted at rest (see SecretCipherService).
  // Never populated for 'auto_refresh_token' — that kind is defined entirely
  // by refreshConfig below and its value is always the runtime cache.
  @Column({ type: 'text', nullable: true })
  value: string | null;

  // 'auto_refresh_token' only — the user-configurable refresh recipe.
  @Column('simple-json', { nullable: true })
  refreshConfig: AutoRefreshTokenConfig | null;

  // Runtime cache for auto_refresh_token variables — not user-edited.
  @Column({ type: 'text', nullable: true })
  cachedValue: string | null;

  // Stored as text, not a native bigint/numeric column — bigint column
  // semantics (and driver return types: string vs number) differ enough
  // across sql.js/Postgres/Oracle that a plain numeric-string is safer.
  // Parsed with Number(...) wherever it's read.
  @Column({ type: 'text', nullable: true })
  cachedExpiresAtMs: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
