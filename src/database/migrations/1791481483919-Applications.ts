import { MigrationInterface, QueryRunner } from "typeorm";

export class Applications1791481483919 implements MigrationInterface {
    name = 'Applications1791481483919'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."merchant_applications_application_status_enum" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'COMPLETED', 'NEEDS_INFO')`);
        await queryRunner.query(`CREATE TYPE "public"."merchant_applications_risk_status_enum" AS ENUM('PENDING', 'APPROVED', 'NEEDS_INFO', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "merchant_applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "business_name" character varying NOT NULL, "legal_business_name" character varying NOT NULL, "business_type" character varying NOT NULL, "owner_name" character varying NOT NULL, "owner_email" character varying NOT NULL, "owner_phone" character varying NOT NULL, "processing_volume" numeric, "processing_currency" character varying NOT NULL DEFAULT 'USD', "application_status" "public"."merchant_applications_application_status_enum" NOT NULL DEFAULT 'DRAFT', "risk_status" "public"."merchant_applications_risk_status_enum" NOT NULL DEFAULT 'PENDING', "created_by_id" uuid NOT NULL, "assigned_reviewer_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_09b9df0877db73b8a232c8c7ed4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "merchant_applications" ADD CONSTRAINT "FK_2da4df0ec53929a13cb78d8496a" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "merchant_applications" ADD CONSTRAINT "FK_7da78a3bb9e76995dba067b83ed" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "merchant_applications" DROP CONSTRAINT "FK_7da78a3bb9e76995dba067b83ed"`);
        await queryRunner.query(`ALTER TABLE "merchant_applications" DROP CONSTRAINT "FK_2da4df0ec53929a13cb78d8496a"`);
        await queryRunner.query(`DROP TABLE "merchant_applications"`);
        await queryRunner.query(`DROP TYPE "public"."merchant_applications_risk_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."merchant_applications_application_status_enum"`);
    }

}
