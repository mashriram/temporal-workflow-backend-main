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
];
