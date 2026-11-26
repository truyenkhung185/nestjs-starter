import { Test, TestingModule } from '@nestjs/testing';
import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

describe('ArticlesController (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const uniqueTag = `nestjs-e2e-${Date.now()}`;
  const otherTag = `other-e2e-${Date.now()}`;
  const authorEmail = `author-${Date.now()}@e2e.local`;
  const fanEmail = `fan-${Date.now()}@e2e.local`;
  const password = 'Password123!';

  let authorToken: string;
  let fanToken: string;
  let fanUserId: string;
  let firstSlug: string;
  let secondSlug: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();

    dataSource = moduleFixture.get(DataSource);

    // Register author & fan users
    const authorRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: authorEmail, password, fullName: 'E2E Author' })
      .expect(201);
    authorToken = authorRes.body.tokens.accessToken;

    const fanRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: fanEmail, password, fullName: 'E2E Fan' })
      .expect(201);
    fanToken = fanRes.body.tokens.accessToken;
    fanUserId = fanRes.body.user.id;

    // Create 2 articles
    const art1Res = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Học NestJS cơ bản',
        description: 'Vietnamese slug test',
        body: 'Body 1',
        tagList: [uniqueTag, 'typescript'],
      })
      .expect(201);
    firstSlug = art1Res.body.slug;

    const art2Res = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Second E2E Article',
        description: 'Second article',
        body: 'Body 2',
        tagList: [otherTag],
      })
      .expect(201);
    secondSlug = art2Res.body.slug;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DELETE FROM "users" WHERE "email" IN ($1, $2)', [
        authorEmail,
        fanEmail,
      ]);
    }
    if (app) {
      await app.close();
    }
  });

  it('should generate ASCII slug from Vietnamese title', () => {
    expect(firstSlug).toMatch(/^hoc-nestjs-co-ban-[a-f0-9]{8}$/);
  });

  it('GET /articles?tag=... should return only articles with that tag', async () => {
    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ tag: uniqueTag })
      .expect(200);

    expect(res.body.articlesCount).toBe(1);
    expect(res.body.articles).toHaveLength(1);
    expect(res.body.articles[0].slug).toBe(firstSlug);
  });

  it('GET /articles?author=... should return only articles by that author', async () => {
    const res = await request(app.getHttpServer())
      .get('/articles')
      .query({ author: authorEmail })
      .expect(200);

    expect(res.body.articlesCount).toBe(2);
    expect(res.body.articles.map((a: any) => a.slug)).toEqual(
      expect.arrayContaining([firstSlug, secondSlug]),
    );
  });

  it('POST /articles/:slug/favorite once should set favoritesCount = 1 (not 2) and filter by favorited email & id', async () => {
    const favRes = await request(app.getHttpServer())
      .post(`/articles/${firstSlug}/favorite`)
      .set('Authorization', `Bearer ${fanToken}`)
      .expect(201);

    expect(favRes.body.favorited).toBe(true);
    expect(favRes.body.favoritesCount).toBe(1);

    // Filter by favorited email
    const byEmailRes = await request(app.getHttpServer())
      .get('/articles')
      .query({ favorited: fanEmail })
      .expect(200);
    expect(byEmailRes.body.articlesCount).toBe(1);
    expect(byEmailRes.body.articles[0].slug).toBe(firstSlug);

    // Filter by favorited user UUID
    const byIdRes = await request(app.getHttpServer())
      .get('/articles')
      .query({ favorited: fanUserId })
      .expect(200);
    expect(byIdRes.body.articlesCount).toBe(1);
    expect(byIdRes.body.articles[0].slug).toBe(firstSlug);

    // Unfavorite once should decrement back to 0 (not negative)
    const unfavRes = await request(app.getHttpServer())
      .delete(`/articles/${firstSlug}/favorite`)
      .set('Authorization', `Bearer ${fanToken}`)
      .expect(200);

    expect(unfavRes.body.favorited).toBe(false);
    expect(unfavRes.body.favoritesCount).toBe(0);
  });

  it('GET /articles should paginate consistently with limit and offset', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/articles')
      .query({ author: authorEmail, limit: 1, offset: 0 })
      .expect(200);

    const page2 = await request(app.getHttpServer())
      .get('/articles')
      .query({ author: authorEmail, limit: 1, offset: 1 })
      .expect(200);

    expect(page1.body.articlesCount).toBe(2);
    expect(page1.body.articles).toHaveLength(1);
    expect(page2.body.articles).toHaveLength(1);
    expect(page1.body.articles[0].id).not.toBe(page2.body.articles[0].id);
  });

  it('PUT /articles/:slug should reject empty title or body with 400', async () => {
    await request(app.getHttpServer())
      .put(`/articles/${firstSlug}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ title: '' })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/articles/${firstSlug}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ body: '   ' })
      .expect(400);
  });
});
