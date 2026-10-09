import { MigrationInterface, QueryRunner } from "typeorm";

export class Audit1791533298837 implements MigrationInterface {
    name = 'Audit1791533298837'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_user_id" uuid, "actor_type" character varying NOT NULL DEFAULT 'USER', "action" character varying NOT NULL, "entity_type" character varying NOT NULL, "entity_id" character varying NOT NULL, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "ip_address" character varying, "user_agent" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b39ee1a0a5c0693ec9d179f05a" ON "audit_logs"  ("actor_user_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_489c43bce08ce9e013179157ae" ON "audit_logs"  ("entity_type", "entity_id", "created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_489c43bce08ce9e013179157ae"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b39ee1a0a5c0693ec9d179f05a"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
