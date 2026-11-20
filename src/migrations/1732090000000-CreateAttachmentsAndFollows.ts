import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttachmentsAndFollows1732090000000
  implements MigrationInterface
{
  name = 'CreateAttachmentsAndFollows1732090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add bio and avatarUrl to users table if they do not exist
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "bio" text,
      ADD COLUMN IF NOT EXISTS "avatarUrl" character varying(500);
    `);

    // 2. Create access_type enum for attachments
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."attachments_access_type_enum" AS ENUM('public', 'private');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );

    // 3. Create polymorphic attachments table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attachments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "file_name" character varying(255) NOT NULL,
        "file_type" character varying(100) NOT NULL,
        "file_size" bigint NOT NULL,
        "storage_path" character varying(500) NOT NULL,
        "url" character varying(500) NOT NULL,
        "access_type" "public"."attachments_access_type_enum" NOT NULL DEFAULT 'public',
        "attachable_type" character varying(100) NOT NULL,
        "attachable_id" uuid NOT NULL,
        "uploader_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attachments_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attachments_polymorphic"
      ON "attachments" ("attachable_type", "attachable_id");
    `);

    // 4. Create user_follows table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_follows" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "follower_id" uuid NOT NULL,
        "following_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_follows" UNIQUE ("follower_id", "following_id"),
        CONSTRAINT "PK_user_follows_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_follows_follower" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_follows_following" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_follows_follower" ON "user_follows" ("follower_id");
      CREATE INDEX IF NOT EXISTS "IDX_user_follows_following" ON "user_follows" ("following_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_follows";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attachments";`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."attachments_access_type_enum";`,
    );
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "avatarUrl",
      DROP COLUMN IF EXISTS "bio";
    `);
  }
}
