import { Entity, PrimaryColumn, Column } from 'typeorm';

// One row per known integration (http, postgres, twilio, sendgrid, ai, and
// new integrations as they're built in later phases). Global, not
// per-user — this is an install-wide toggle, not a per-workspace setting
// (see goal.md §3.2: "IntegrationConfig stays global unless/until
// multi-tenant needs say otherwise").
@Entity('integration_configs')
export class IntegrationConfig {
  @PrimaryColumn('varchar', { length: 64 })
  id: string; // 'outlook', 'servicenow', 'http', ...

  @Column()
  label: string;

  @Column({ default: false })
  enabled: boolean;

  // Non-secret config (e.g. a ServiceNow instance URL). Secrets live in
  // Environment variables (kind: 'secret'), never here.
  @Column('simple-json', { nullable: true })
  settings: Record<string, any> | null;
}
