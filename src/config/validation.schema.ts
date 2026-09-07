import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Database driver selection — zero code branching, config only.
  DB_TYPE: Joi.string()
    .valid('sqljs', 'postgres', 'oracle')
    .default('postgres'),

  // Required only when actually connecting to a server DB. sql.js (office
  // dev, no Docker/native drivers) needs none of these.
  DB_HOST: Joi.string().when('DB_TYPE', {
    is: Joi.valid('postgres', 'oracle'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().when('DB_TYPE', {
    is: Joi.valid('postgres', 'oracle'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  DB_PASSWORD: Joi.string().when('DB_TYPE', {
    is: Joi.valid('postgres', 'oracle'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  DB_NAME: Joi.string().when('DB_TYPE', {
    is: Joi.valid('postgres', 'oracle'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  DB_SQLJS_FILE: Joi.string().optional(),
  DB_ORACLE_SID: Joi.string().when('DB_TYPE', {
    is: 'oracle',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // Escape hatch back to the old synchronize:true behavior for Postgres/
  // Oracle, for a quick throwaway local database where running migrations
  // is friction. Migrations own the schema by default now — see
  // database.module.ts and src/migrations/.
  DB_SYNCHRONIZE: Joi.string().valid('true', 'false').optional(),

  // Secrets-at-rest key for EnvironmentVariable encryption. Optional so dev
  // boots don't hard-fail, but SecretCipherService logs a loud warning and
  // uses an insecure fallback if this is unset — never rely on that in prod.
  ENCRYPTION_KEY: Joi.string().optional(),

  // JWT signing secret for auth. Same story as ENCRYPTION_KEY — optional
  // for dev, AuthModule logs a loud warning and uses an insecure fallback
  // if unset. Never rely on the fallback in prod.
  JWT_SECRET: Joi.string().optional(),
});
