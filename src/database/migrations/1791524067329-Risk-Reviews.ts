import { MigrationInterface, QueryRunner } from "typeorm";

export class RiskReviews1791524067329 implements MigrationInterface {
    name = 'RiskReviews1791524067329'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."risk_reviews_decision_enum" AS ENUM('PENDING', 'APPROVED', 'NEEDS_INFO', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "risk_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "provider" character varying NOT NULL, "provider_reference" character varying NOT NULL, "decision" "public"."risk_reviews_decision_enum" NOT NULL, "reason" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_32e1cd29b2ee1ca11018f2e525c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_01e7bad3dad96afda5d9631f8d" ON "risk_reviews"  ("application_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_01e7bad3dad96afda5d9631f8d"`);
        await queryRunner.query(`DROP TABLE "risk_reviews"`);
        await queryRunner.query(`DROP TYPE "public"."risk_reviews_decision_enum"`);
    }

}
