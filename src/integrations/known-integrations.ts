// Source of truth for which integrations exist and their default enabled
// state + required env vars (used to compute "missing config" for the
// Settings page). New integrations built in later phases (Outlook,
// ServiceNow, AppDynamics, OpenShift, ELK, GitLab) add a row here.
//
// Kept in sync BY CONVENTION with engine's manifest list
// (src/integrations/manifests.ts) and the UI's INTEGRATION_REGISTRY ids —
// see implementation.md §10 on cross-repo consistency. There is
// deliberately no shared package; this file is the canonical list.
export interface KnownIntegration {
  id: string;
  label: string;
  defaultEnabled: boolean;
  requiredEnvVars: string[];
  // For integrations whose credentials live in a per-Environment variable
  // (Postman-style, see goal.md §3.4) rather than a raw process.env var —
  // requiredEnvVars doesn't apply to those, so surface the expectation
  // here instead.
  configNote?: string;
}

export const KNOWN_INTEGRATIONS: KnownIntegration[] = [
  { id: 'http', label: 'HTTP Request', defaultEnabled: true, requiredEnvVars: [] },
  { id: 'postgres', label: 'PostgreSQL Query', defaultEnabled: true, requiredEnvVars: [] },
  {
    id: 'twilio',
    label: 'Twilio (SMS / Voice)',
    defaultEnabled: false,
    requiredEnvVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
  },
  {
    id: 'sendgrid',
    label: 'SendGrid (Email)',
    defaultEnabled: false,
    requiredEnvVars: ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'],
  },
  {
    id: 'ai',
    label: 'AI (LangChain — disabled by default, see goal.md §4)',
    defaultEnabled: false,
    requiredEnvVars: ['OPENAI_API_KEY'],
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft Graph (draft-only — never sends or deletes)',
    defaultEnabled: false,
    requiredEnvVars: [],
    configNote:
      'Add an auto_refresh_token Environment variable (default name ' +
      'OUTLOOK_GRAPH_TOKEN) pointed at your Azure AD app registration\'s ' +
      'client-credentials token endpoint, scoped to Mail.ReadWrite and ' +
      'Mail.Read only — never grant Mail.Send.',
  },
  {
    id: 'servicenow',
    label: 'ServiceNow (Table API)',
    defaultEnabled: false,
    requiredEnvVars: [],
    configNote:
      'Add SERVICENOW_USERNAME (static) and SERVICENOW_PASSWORD (secret) ' +
      'Environment variables for Basic Auth against your instance\'s ' +
      'Table API; set the instance URL per-node.',
  },
  {
    id: 'appdynamics',
    label: 'AppDynamics (read-only: metrics + health rules)',
    defaultEnabled: false,
    requiredEnvVars: [],
    configNote:
      'Add a secret Environment variable (default name APPD_TOKEN) ' +
      'holding a Controller API bearer token.',
  },
  {
    id: 'openshift',
    label: 'OpenShift / Kubernetes (read-only: pods + rollouts)',
    defaultEnabled: false,
    requiredEnvVars: [],
    configNote:
      'Add a secret Environment variable (default name OPENSHIFT_TOKEN) ' +
      'holding a ServiceAccount or OAuth bearer token, scoped read-only.',
  },
  {
    id: 'elk',
    label: 'ELK / Kibana (read-only: log search + alert status)',
    defaultEnabled: false,
    requiredEnvVars: [],
    configNote:
      'Add a secret Environment variable (default name ELK_TOKEN) ' +
      'holding an API key or bearer token for your cluster.',
  },
  {
    id: 'gitlab',
    label: 'GitLab (pipelines + merge requests)',
    defaultEnabled: false,
    requiredEnvVars: [],
    configNote:
      'Add a secret Environment variable (default name GITLAB_TOKEN) ' +
      'holding a personal or project access token with api scope.',
  },
];
