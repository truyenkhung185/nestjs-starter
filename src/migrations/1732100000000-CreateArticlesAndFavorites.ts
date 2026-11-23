import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArticlesAndFavorites1732100000000
  implements MigrationInterface
{
  name = 'CreateArticlesAndFavorites1732100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "articles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "slug" character varying NOT NULL,
        "title" character varying NOT NULL,
        "description" text,
        "body" text NOT NULL,
        "author_id" uuid NOT NULL,
        "tagList" text[] NOT NULL DEFAULT '{}',
        "favorites_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_articles_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_articles_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_articles_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_articles_slug" ON "articles" ("slug");
      CREATE INDEX IF NOT EXISTS "IDX_articles_author" ON "articles" ("author_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "article_favorites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "article_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_article_favorites" UNIQUE ("user_id", "article_id"),
        CONSTRAINT "PK_article_favorites_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_article_favorites_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_article_favorites_article" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_article_favorites_user" ON "article_favorites" ("user_id");
      CREATE INDEX IF NOT EXISTS "IDX_article_favorites_article" ON "article_favorites" ("article_id");
    `);

    // Trigger to keep articles.favorites_count automatically synchronized with article_favorites
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_article_favorites_count()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          UPDATE "articles"
          SET "favorites_count" = "favorites_count" + 1
          WHERE "id" = NEW."article_id";
        ELSIF TG_OP = 'DELETE' THEN
          UPDATE "articles"
          SET "favorites_count" = GREATEST(0, "favorites_count" - 1)
          WHERE "id" = OLD."article_id";
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_article_favorites_count" ON "article_favorites";
      CREATE TRIGGER "trg_article_favorites_count"
      AFTER INSERT OR DELETE ON "article_favorites"
      FOR EACH ROW
      EXECUTE FUNCTION update_article_favorites_count();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_article_favorites_count" ON "article_favorites";`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_article_favorites_count;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "article_favorites";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "articles";`);
  }
}
