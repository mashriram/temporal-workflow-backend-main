export default () => ({
  // 1. App Config (Non-sensitive defaults)
  app: {
    port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000,
    environment: process.env.NODE_ENV || 'development',
  },

  // 2. Temporal Config (Mixed)
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'agentic-workflow-queue',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
  },

  // 3. Database Config (Secrets)
  database: {
    type: process.env.DB_TYPE || 'postgres', // 'sqljs' | 'postgres' | 'oracle'
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number.parseInt(process.env.DB_PORT, 10) : 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    sqljsFile: process.env.DB_SQLJS_FILE || './data/app.sqlite',
    oracleSid: process.env.DB_ORACLE_SID,
  },

  // 4. Secrets-at-rest key for EnvironmentVariable encryption (never in DB).
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
});
