import request from 'supertest';
import { User, UserRole } from '../src/users/entities/user.entity.js';
import { createTestApp, TestAppContext } from './helpers/test-app.helper.js';
import { flushTestRedis, truncateAllTables } from './helpers/test-db.helper.js';
import { createFakeUser, loginAs } from './helpers/factory.helper.js';

describe('ArticlesController (e2e)', () => {
  let ctx: TestAppContext;
  let author: User;
  let authorToken: string;
  let fan: User;
  let fanToken: string;
  let firstSlug: string;
  let secondSlug: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    const seededAuthor = await createFakeUser(ctx.dataSource, {
      role: UserRole.USER,
    });
    author = seededAuthor.user;
    authorToken = await loginAs(ctx.app, author.email, seededAuthor.rawPassword);

    const seededFan = await createFakeUser(ctx.dataSource, {
      role: UserRole.USER,
    });
    fan = seededFan.user;
    fanToken = await loginAs(ctx.app, fan.email, seededFan.rawPassword);

    const art1Res = await request(ctx.app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Học NestJS cơ bản',
        description: 'Vietnamese slug test',
        body: 'Body 1',
        tagList: ['nestjs', 'typescript'],
      })
      .expect(201);
    firstSlug = art1Res.body.slug;

    const art2Res = await request(ctx.app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Second E2E Article',
        description: 'Second article',
        body: 'Body 2',
        tagList: ['react'],
      })
      .expect(201);
    secondSlug = art2Res.body.slug;
  });

  afterEach(async () => {
    await truncateAllTables(ctx.dataSource);
    await flushTestRedis();
  });

  afterAll(async () => {
    if (ctx?.app) {
      await ctx.app.close();
    }
  });

  it('should generate ASCII slug from Vietnamese title and hide author email', async () => {
    expect(firstSlug).toMatch(/^hoc-nestjs-co-ban-[a-f0-9]{8}$/);

    const res = await request(ctx.app.getHttpServer())
      .get(`/articles/${firstSlug}`)
      .expect(200);
    expect(res.body.author).not.toHaveProperty('email');
  });

  it('GET /articles?tag=nestjs should return only articles with that tag', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/articles')
      .query({ tag: 'nestjs' })
      .expect(200);

    expect(res.body.articlesCount).toBe(1);
    expect(res.body.articles).toHaveLength(1);
    expect(res.body.articles[0].slug).toBe(firstSlug);
  });

  it('GET /articles?author=... should return only articles by that author', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/articles')
      .query({ author: author.email })
      .expect(200);

    expect(res.body.articlesCount).toBe(2);
    expect(res.body.articles.map((a: any) => a.slug)).toEqual(
      expect.arrayContaining([firstSlug, secondSlug]),
    );
  });

  it('POST /articles/:slug/favorite once should set favoritesCount = 1 (not 2) and filter by favorited email & id', async () => {
    const favRes = await request(ctx.app.getHttpServer())
      .post(`/articles/${firstSlug}/favorite`)
      .set('Authorization', `Bearer ${fanToken}`)
      .expect(201);

    expect(favRes.body.favorited).toBe(true);
    expect(favRes.body.favoritesCount).toBe(1);

    const byEmailRes = await request(ctx.app.getHttpServer())
      .get('/articles')
      .query({ favorited: fan.email })
      .expect(200);
    expect(byEmailRes.body.articlesCount).toBe(1);
    expect(byEmailRes.body.articles[0].slug).toBe(firstSlug);

    const byIdRes = await request(ctx.app.getHttpServer())
      .get('/articles')
      .query({ favorited: fan.id })
      .expect(200);
    expect(byIdRes.body.articlesCount).toBe(1);
    expect(byIdRes.body.articles[0].slug).toBe(firstSlug);

    const unfavRes = await request(ctx.app.getHttpServer())
      .delete(`/articles/${firstSlug}/favorite`)
      .set('Authorization', `Bearer ${fanToken}`)
      .expect(200);

    expect(unfavRes.body.favorited).toBe(false);
    expect(unfavRes.body.favoritesCount).toBe(0);
  });

  it('GET /articles should paginate consistently with limit and offset', async () => {
    const page1 = await request(ctx.app.getHttpServer())
      .get('/articles')
      .query({ author: author.email, limit: 1, offset: 0 })
      .expect(200);

    const page2 = await request(ctx.app.getHttpServer())
      .get('/articles')
      .query({ author: author.email, limit: 1, offset: 1 })
      .expect(200);

    expect(page1.body.articlesCount).toBe(2);
    expect(page1.body.articles).toHaveLength(1);
    expect(page2.body.articles).toHaveLength(1);
    expect(page1.body.articles[0].id).not.toBe(page2.body.articles[0].id);
  });

  it('PUT /articles/:slug should reject empty title or body with 400', async () => {
    await request(ctx.app.getHttpServer())
      .put(`/articles/${firstSlug}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ title: '' })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .put(`/articles/${firstSlug}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ body: '   ' })
      .expect(400);
  });
});
