import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1788748631702 implements MigrationInterface {
  name = 'InitialSchema1788748631702';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "workflow_runs" ("id" character varying(36) NOT NULL, "temporalWorkflowId" character varying NOT NULL, "temporalRunId" character varying NOT NULL, "status" character varying NOT NULL, "input" text, "output" text, "error" text, "metadata" text NOT NULL, "triggerType" character varying NOT NULL DEFAULT 'WEBHOOK', "environmentId" character varying, "definitionId" character varying, "startedAt" TIMESTAMP NOT NULL DEFAULT now(), "completedAt" TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_eea9f8d0a660b3f48114c313233" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e9c2a89950359abe0625334400" ON "workflow_runs" ("temporalWorkflowId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_59536545c4adc8a5a4c2fb3f97" ON "workflow_runs" ("temporalRunId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_043a902b25faa1ff76a96f56e7" ON "workflow_runs" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workflow_definitions" ("id" character varying(36) NOT NULL, "workflowId" character varying NOT NULL, "name" character varying NOT NULL, "ownerId" character varying, "tags" text, "status" character varying NOT NULL DEFAULT 'DRAFT', "isActive" boolean NOT NULL DEFAULT false, "nodes" text NOT NULL, "edges" text NOT NULL, "deployedGraph" text, "triggerType" character varying NOT NULL DEFAULT 'WEBHOOK', "cronExpression" text, "environmentId" character varying, "webhookSecret" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ce278ce247b82408d716d52e106" UNIQUE ("workflowId"), CONSTRAINT "PK_4f92fadfc5fb722f080ceaec272" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" character varying(36) NOT NULL, "workflowRunId" character varying NOT NULL, "workflowId" character varying NOT NULL, "nodeId" character varying NOT NULL, "nodeName" character varying NOT NULL, "nodeType" character varying NOT NULL, "status" character varying NOT NULL, "details" text, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_69ab0ba0c237b259fe93208c44" ON "audit_logs" ("workflowRunId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d89f1acac44cff2f13d050299c" ON "audit_logs" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "environment_variables" ("id" character varying(36) NOT NULL, "environmentId" character varying NOT NULL, "key" character varying NOT NULL, "kind" character varying NOT NULL DEFAULT 'static', "value" text, "refreshConfig" text, "cachedValue" text, "cachedExpiresAtMs" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_58b382642e67cefe198cd9f660b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "environments" ("id" character varying(36) NOT NULL, "ownerId" character varying, "name" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ec32d12469ec3c2f2f20c4f5e71" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "integration_configs" ("id" character varying(64) NOT NULL, "label" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "settings" text, CONSTRAINT "PK_5ca9b0024e0f8a3f00222bbe09d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "approval_requests" ("id" character varying(36) NOT NULL, "runId" character varying NOT NULL, "nodeId" character varying NOT NULL, "title" character varying NOT NULL, "instructions" text, "requireProofUpload" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'pending', "requestedAt" TIMESTAMP NOT NULL DEFAULT now(), "resolvedAt" TIMESTAMP, "resolvedBy" character varying, "proofFileId" character varying, CONSTRAINT "PK_484806bb8ff331b851fc75973c0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8ee499127ed34836c294a05f1" ON "approval_requests" ("runId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "uploaded_files" ("id" character varying(36) NOT NULL, "runId" character varying, "nodeId" character varying, "filename" character varying NOT NULL, "storagePath" character varying NOT NULL, "uploadedBy" character varying, "uploadedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e2d47e01bd5be386bf0067b2ed8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" character varying(36) NOT NULL, "username" character varying NOT NULL, "passwordHash" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "workflow_versions" ("id" character varying(36) NOT NULL, "workflowId" character varying NOT NULL, "versionNumber" integer NOT NULL, "nodes" text NOT NULL, "edges" text NOT NULL, "createdBy" character varying, "note" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a84eb8dc6065f33ce4b1447955f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2dbabb54888badc718e3cb1863" ON "workflow_versions" ("workflowId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_runs" ADD CONSTRAINT "FK_21b3642326a9627e5be6afc605d" FOREIGN KEY ("definitionId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "environment_variables" ADD CONSTRAINT "FK_e5cea1047c2e11cf1a874fe02b0" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "environment_variables" DROP CONSTRAINT "FK_e5cea1047c2e11cf1a874fe02b0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_runs" DROP CONSTRAINT "FK_21b3642326a9627e5be6afc605d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2dbabb54888badc718e3cb1863"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_versions"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "uploaded_files"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f8ee499127ed34836c294a05f1"`,
    );
    await queryRunner.query(`DROP TABLE "approval_requests"`);
    await queryRunner.query(`DROP TABLE "integration_configs"`);
    await queryRunner.query(`DROP TABLE "environments"`);
    await queryRunner.query(`DROP TABLE "environment_variables"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d89f1acac44cff2f13d050299c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_69ab0ba0c237b259fe93208c44"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "workflow_definitions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_043a902b25faa1ff76a96f56e7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_59536545c4adc8a5a4c2fb3f97"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e9c2a89950359abe0625334400"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_runs"`);
  }
}
