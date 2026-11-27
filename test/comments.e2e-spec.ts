import { faker } from '@faker-js/faker';
import * as crypto from 'crypto';
import request from 'supertest';
import { User, UserRole } from '../src/users/entities/user.entity.js';
import { Article } from '../src/articles/entities/article.entity.js';
import { Comment } from '../src/comments/entities/comment.entity.js';
import { COMMENT_FIELD_LIMITS } from '../src/comments/constants/comment.constants.js';
import { createTestApp, TestAppContext } from './helpers/test-app.helper.js';
import { flushTestRedis, truncateAllTables } from './helpers/test-db.helper.js';
import {
  createFakeArticle,
  createFakeComment,
  createFakeFollow,
  createFakeUser,
  loginAs,
  signTestToken,
} from './helpers/factory.helper.js';

/**
 * C2-Level (Branch + Multiple Condition) E2E Test Suite for CommentsController
 *
 * Endpoints covered:
 *   1. POST   /articles/:slug/comments      (addComment)
 *   2. GET    /articles/:slug/comments      (getComments)
 *   3. DELETE /articles/:slug/comments/:id  (deleteComment)
 *
 * Test isolation:
 *   - Dedicated test DB configured via .env.test (nestjs_test_db)
 *   - Fresh fake data seeded before each test case (beforeEach + @faker-js/faker)
 *   - Full TRUNCATE ... RESTART IDENTITY CASCADE + Redis flush after each test case (afterEach)
 *
 * C2 Condition Matrix:
 *   - POST /articles/:slug/comments:
 *     [C1]  JwtAuthGuard: missing token -> 401
 *     [C2]  JwtAuthGuard: malformed/invalid token -> 401
 *     [C3]  JwtAuthGuard: expired token -> 401
 *     [C4]  JwtAuthGuard: blacklisted (logged-out) token -> 401
 *     [C5]  JwtAuthGuard: user inactive (isActive=false) -> 401
 *     [C6]  JwtAuthGuard: user deleted from DB (!user=true) -> 401
 *     [C7]  CreateCommentDto: missing body -> 400
 *     [C8]  CreateCommentDto: non-string body -> 400
 *     [C9]  CreateCommentDto: empty / whitespace-only body -> 400
 *     [C10] CreateCommentDto: body > BODY_MAX_LENGTH (2000 chars) -> 400
 *     [C11] ValidationPipe (forbidNonWhitelisted): extra unknown field -> 400
 *     [C12] Service: !article=true (slug not found) -> 404 (verified in en & vi)
 *     [C13] Service: !article=false & valid body -> 201, trimmed body persisted in DB, no author email leaked
 *
 *   - GET /articles/:slug/comments:
 *     [C14] QueryCommentsDto: limit < 1 -> 400
 *     [C15] QueryCommentsDto: limit > MAX_PAGE_LIMIT (100) -> 400
 *     [C16] QueryCommentsDto: offset < 0 -> 400
 *     [C17] QueryCommentsDto: non-integer limit/offset -> 400
 *     [C18] Service: !article=true -> 404
 *     [C19] Service: !article=false & comments.length === 0 -> 200 empty array & count=0
 *     [C20] OptionalJwtAuthGuard (no token) & comments.length > 0 -> 200, following=false, no email
 *     [C21] OptionalJwtAuthGuard (invalid token) -> falls back to guest -> 200, following=false
 *     [C22] OptionalJwtAuthGuard (valid token) & comments.length > 0 -> following=true for followed author, false for unfollowed
 *     [C23] Pagination (limit & offset) + tie-breaker ordering (createdAt DESC, id DESC) for identical createdAt
 *
 *   - DELETE /articles/:slug/comments/:id:
 *     [C24] JwtAuthGuard: missing token -> 401
 *     [C25] ParseUUIDPipe: invalid UUID param -> 400
 *     [C26] Service: !article=true -> 404
 *     [C27] Service: article found, !comment=true (non-existent comment ID) -> 404
 *     [C28] Service: article found, comment exists on DIFFERENT article (IDOR) -> 404, comment preserved in DB
 *     [C29] Compound authz (comment.authorId !== userId && userRole !== ADMIN):
 *           - (FALSE && TRUE)  Author with USER role -> 200, deleted from DB
 *     [C30] - (TRUE  && FALSE) Non-author with ADMIN role -> 200, deleted from DB
 *     [C31] - (FALSE && FALSE) Author with ADMIN role -> 200, deleted from DB
 *     [C32] - (TRUE  && TRUE)  Non-author with USER role -> 403 (verified en & vi), still exists in DB
 */
describe('CommentsController (E2E - C2 Coverage)', () => {
  let ctx: TestAppContext;

  // Fake seeded baseline entities per test case
  let articleAuthor: User;
  let articleAuthorPassword: string;
  let commenter: User;
  let commenterPassword: string;
  let otherUser: User;
  let otherUserPassword: string;
  let adminUser: User;
  let adminPassword: string;
  let article: Article;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    // Seed fresh fake data before every single test case
    const seededAuthor = await createFakeUser(ctx.dataSource, {
      role: UserRole.USER,
    });
    articleAuthor = seededAuthor.user;
    articleAuthorPassword = seededAuthor.rawPassword;

    const seededCommenter = await createFakeUser(ctx.dataSource, {
      role: UserRole.USER,
    });
    commenter = seededCommenter.user;
    commenterPassword = seededCommenter.rawPassword;

    const seededOther = await createFakeUser(ctx.dataSource, {
      role: UserRole.USER,
    });
    otherUser = seededOther.user;
    otherUserPassword = seededOther.rawPassword;

    const seededAdmin = await createFakeUser(ctx.dataSource, {
      role: UserRole.ADMIN,
    });
    adminUser = seededAdmin.user;
    adminPassword = seededAdmin.rawPassword;

    article = await createFakeArticle(ctx.dataSource, articleAuthor.id);
  });

  afterEach(async () => {
    // Truncate entire test DB and flush test Redis after every test case
    await truncateAllTables(ctx.dataSource);
    await flushTestRedis();
  });

  afterAll(async () => {
    if (ctx?.app) {
      await ctx.app.close();
    }
  });

  // =========================================================================
  // 1. POST /articles/:slug/comments
  // =========================================================================
  describe('POST /articles/:slug/comments', () => {
    it('[C1] should return 401 when Authorization header is missing', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .send({ body: faker.lorem.sentence() })
        .expect(401);
    });

    it('[C2] should return 401 when JWT token is malformed/invalid', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', 'Bearer invalid.jwt.token')
        .send({ body: faker.lorem.sentence() })
        .expect(401);
    });

    it('[C3] should return 401 when JWT token is expired', async () => {
      const expiredToken = await signTestToken(
        ctx.jwtService,
        ctx.configService,
        commenter,
        '-10s',
      );

      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ body: faker.lorem.sentence() })
        .expect(401);
    });

    it('[C4] should return 401 when JWT token has been logged out (blacklisted in Redis)', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      await request(ctx.app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: faker.lorem.sentence() })
        .expect(401);
    });

    it('[C5] should return 401 when authenticated user is inactive (isActive=false)', async () => {
      const { user: inactiveUser } = await createFakeUser(ctx.dataSource, {
        isActive: false,
      });
      const token = await signTestToken(
        ctx.jwtService,
        ctx.configService,
        inactiveUser,
      );

      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: faker.lorem.sentence() })
        .expect(401);
    });

    it('[C6] should return 401 when user encoded in JWT no longer exists in DB', async () => {
      const ghostToken = await signTestToken(
        ctx.jwtService,
        ctx.configService,
        {
          id: crypto.randomUUID(),
          email: faker.internet.email(),
          role: UserRole.USER,
        },
      );

      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${ghostToken}`)
        .send({ body: faker.lorem.sentence() })
        .expect(401);
    });

    it('[C7] should return 400 when body field is missing', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('[C8] should return 400 when body is not a string', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 12345 })
        .expect(400);
    });

    it('[C9] should return 400 when body is empty or whitespace-only', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: '     ' })
        .expect(400);
    });

    it('[C10] should return 400 when body exceeds BODY_MAX_LENGTH', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);
      const oversizedBody = 'a'.repeat(COMMENT_FIELD_LIMITS.BODY_MAX_LENGTH + 1);

      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: oversizedBody })
        .expect(400);
    });

    it('[C11] should return 400 when payload contains non-whitelisted extra fields', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: faker.lorem.sentence(), maliciousField: 'inject' })
        .expect(400);
    });

    it('[C12] should return 404 when article slug does not exist (with en & vi i18n)', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);
      const missingSlug = `missing-${faker.string.alphanumeric(8)}`;

      const enRes = await request(ctx.app.getHttpServer())
        .post(`/articles/${missingSlug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .set('Accept-Language', 'en')
        .send({ body: faker.lorem.sentence() })
        .expect(404);
      expect(enRes.body.message).toContain(missingSlug);

      const viRes = await request(ctx.app.getHttpServer())
        .post(`/articles/${missingSlug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .set('Accept-Language', 'vi')
        .send({ body: faker.lorem.sentence() })
        .expect(404);
      expect(viRes.body.message).toContain('Không tìm thấy bài viết');
    });

    it('[C13] should create comment (201), trim body, persist to DB, and hide author email', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);
      const rawText = faker.lorem.sentence();

      const res = await request(ctx.app.getHttpServer())
        .post(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `   ${rawText}   ` })
        .expect(201);

      expect(res.body).toMatchObject({
        body: rawText,
        author: {
          id: commenter.id,
          fullName: commenter.fullName,
          bio: commenter.bio,
          avatarUrl: commenter.avatarUrl,
          following: false,
        },
      });
      expect(res.body.author).not.toHaveProperty('email');
      expect(res.body.author).not.toHaveProperty('password');

      // Verify persisted directly in PostgreSQL test DB
      const savedInDb = await ctx.dataSource
        .getRepository(Comment)
        .findOne({ where: { id: res.body.id } });
      expect(savedInDb).not.toBeNull();
      expect(savedInDb!.body).toBe(rawText);
      expect(savedInDb!.articleId).toBe(article.id);
      expect(savedInDb!.authorId).toBe(commenter.id);
    });
  });

  // =========================================================================
  // 2. GET /articles/:slug/comments
  // =========================================================================
  describe('GET /articles/:slug/comments', () => {
    it('[C14] should return 400 when limit < 1', async () => {
      await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .query({ limit: 0 })
        .expect(400);
    });

    it('[C15] should return 400 when limit > MAX_PAGE_LIMIT (100)', async () => {
      await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .query({ limit: COMMENT_FIELD_LIMITS.MAX_PAGE_LIMIT + 1 })
        .expect(400);
    });

    it('[C16] should return 400 when offset < 0', async () => {
      await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .query({ offset: -1 })
        .expect(400);
    });

    it('[C17] should return 400 when limit or offset is not an integer', async () => {
      await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .query({ limit: 'abc', offset: 'xyz' })
        .expect(400);
    });

    it('[C18] should return 404 when article slug does not exist', async () => {
      await request(ctx.app.getHttpServer())
        .get('/articles/non-existent-article-slug/comments')
        .expect(404);
    });

    it('[C19] should return 200 with empty list when article has no comments', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .expect(200);

      expect(res.body).toEqual({ comments: [], commentsCount: 0 });
    });

    it('[C20] should allow guest (no token) to view comments with following=false and no author email', async () => {
      const seededComment = await createFakeComment(
        ctx.dataSource,
        article.id,
        commenter.id,
      );

      const res = await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .expect(200);

      expect(res.body.commentsCount).toBe(1);
      expect(res.body.comments).toHaveLength(1);
      expect(res.body.comments[0].id).toBe(seededComment.id);
      expect(res.body.comments[0].author.following).toBe(false);
      expect(res.body.comments[0].author).not.toHaveProperty('email');
    });

    it('[C21] should treat invalid Bearer token as guest via OptionalJwtAuthGuard (200)', async () => {
      await createFakeComment(ctx.dataSource, article.id, commenter.id);

      const res = await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .set('Authorization', 'Bearer malformed.token.value')
        .expect(200);

      expect(res.body.commentsCount).toBe(1);
      expect(res.body.comments[0].author.following).toBe(false);
    });

    it('[C22] should return accurate following=true/false per author for authenticated viewer', async () => {
      // otherUser follows commenter, but does NOT follow articleAuthor
      await createFakeFollow(ctx.dataSource, otherUser.id, commenter.id);

      const followedComment = await createFakeComment(
        ctx.dataSource,
        article.id,
        commenter.id,
      );
      const unfollowedComment = await createFakeComment(
        ctx.dataSource,
        article.id,
        articleAuthor.id,
      );

      const viewerToken = await loginAs(ctx.app, otherUser.email, otherUserPassword);

      const res = await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(res.body.commentsCount).toBe(2);
      const byId = new Map<string, any>(
        res.body.comments.map((c: any) => [c.id, c]),
      );

      expect(byId.get(followedComment.id).author.following).toBe(true);
      expect(byId.get(unfollowedComment.id).author.following).toBe(false);
      expect(byId.get(followedComment.id).author).not.toHaveProperty('email');
    });

    it('[C23] should paginate deterministically using tie-breaker (createdAt DESC, id DESC) when timestamps match', async () => {
      const sameTimestamp = new Date('2026-11-27T10:00:00.000Z');
      const seededIds: string[] = [];

      for (let i = 0; i < 4; i++) {
        const c = await createFakeComment(ctx.dataSource, article.id, commenter.id, {
          createdAt: sameTimestamp,
        });
        seededIds.push(c.id);
      }

      const page1 = await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .query({ limit: 2, offset: 0 })
        .expect(200);

      const page2 = await request(ctx.app.getHttpServer())
        .get(`/articles/${article.slug}/comments`)
        .query({ limit: 2, offset: 2 })
        .expect(200);

      expect(page1.body.commentsCount).toBe(4);
      expect(page1.body.comments).toHaveLength(2);
      expect(page2.body.comments).toHaveLength(2);

      const combinedIds = [
        ...page1.body.comments.map((c: any) => c.id),
        ...page2.body.comments.map((c: any) => c.id),
      ];

      // Zero duplicates across pages & strictly sorted by UUID DESC for equal timestamps
      expect(new Set(combinedIds).size).toBe(4);
      const expectedSorted = [...seededIds].sort((a, b) => (a < b ? 1 : -1));
      expect(combinedIds).toEqual(expectedSorted);
    });
  });

  // =========================================================================
  // 3. DELETE /articles/:slug/comments/:id
  // =========================================================================
  describe('DELETE /articles/:slug/comments/:id', () => {
    it('[C24] should return 401 when unauthenticated', async () => {
      const comment = await createFakeComment(
        ctx.dataSource,
        article.id,
        commenter.id,
      );

      await request(ctx.app.getHttpServer())
        .delete(`/articles/${article.slug}/comments/${comment.id}`)
        .expect(401);
    });

    it('[C25] should return 400 when comment id param is not a valid UUID', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      await request(ctx.app.getHttpServer())
        .delete(`/articles/${article.slug}/comments/not-a-valid-uuid`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('[C26] should return 404 when article slug does not exist', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      await request(ctx.app.getHttpServer())
        .delete(`/articles/missing-slug/comments/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('[C27] should return 404 when comment UUID does not exist', async () => {
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      await request(ctx.app.getHttpServer())
        .delete(`/articles/${article.slug}/comments/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('[C28] should return 404 when comment belongs to a DIFFERENT article (IDOR protection)', async () => {
      const secondArticle = await createFakeArticle(
        ctx.dataSource,
        articleAuthor.id,
      );
      const commentOnSecondArticle = await createFakeComment(
        ctx.dataSource,
        secondArticle.id,
        commenter.id,
      );
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      await request(ctx.app.getHttpServer())
        .delete(`/articles/${article.slug}/comments/${commentOnSecondArticle.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      // Ensure the comment on secondArticle was NOT deleted
      const stillExists = await ctx.dataSource
        .getRepository(Comment)
        .findOne({ where: { id: commentOnSecondArticle.id } });
      expect(stillExists).not.toBeNull();
    });

    it('[C29] authz (authorId !== userId: FALSE && role !== ADMIN: TRUE) -> comment author (USER) deletes own comment (200)', async () => {
      const comment = await createFakeComment(
        ctx.dataSource,
        article.id,
        commenter.id,
      );
      const token = await loginAs(ctx.app, commenter.email, commenterPassword);

      const res = await request(ctx.app.getHttpServer())
        .delete(`/articles/${article.slug}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.message).toBeDefined();

      const deletedInDb = await ctx.dataSource
        .getRepository(Comment)
        .findOne({ where: { id: comment.id } });
      expect(deletedInDb).toBeNull();
    });

    it('[C30] authz (authorId !== userId: TRUE && role !== ADMIN: FALSE) -> ADMIN deletes another user comment (200)', async () => {
      const comment = await createFakeComment(
        ctx.dataSource,
        article.id,
        commenter.id,
      );
      const adminToken = await loginAs(ctx.app, adminUser.email, adminPassword);

      await request(ctx.app.getHttpServer())
        .delete(`/articles/${article.slug}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const deletedInDb = await ctx.dataSource
        .getRepository(Comment)
        .findOne({ where: { id: comment.id } });
      expect(deletedInDb).toBeNull();
    });

    it('[C31] authz (authorId !== userId: FALSE && role !== ADMIN: FALSE) -> ADMIN deletes own comment (200)', async () => {
      const adminComment = await createFakeComment(
        ctx.dataSource,
        article.id,
        adminUser.id,
      );
      const adminToken = await loginAs(ctx.app, adminUser.email, adminPassword);

      await request(ctx.app.getHttpServer())
        .delete(`/articles/${article.slug}/comments/${adminComment.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const deletedInDb = await ctx.dataSource
        .getRepository(Comment)
        .findOne({ where: { id: adminComment.id } });
      expect(deletedInDb).toBeNull();
    });

    it('[C32] authz (authorId !== userId: TRUE && role !== ADMIN: TRUE) -> other USER receives 403 (en & vi) and comment stays in DB', async () => {
      const comment = await createFakeComment(
        ctx.dataSource,
        article.id,
        commenter.id,
      );
      const otherToken = await loginAs(ctx.app, otherUser.email, otherUserPassword);
      // Also verify articleAuthor (who is not the comment author & not admin) cannot delete someone else's comment
      const articleAuthorToken = await loginAs(
        ctx.app,
        articleAuthor.email,
        articleAuthorPassword,
      );

      const enRes = await request(ctx.app.getHttpServer())
        .delete(`/articles/${article.slug}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .set('Accept-Language', 'en')
        .expect(403);
      expect(enRes.body.message).toBe('You are not allowed to delete this comment');

      const viRes = await request(ctx.app.getHttpServer())
        .delete(`/articles/${article.slug}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${articleAuthorToken}`)
        .set('Accept-Language', 'vi')
        .expect(403);
      expect(viRes.body.message).toBe('Bạn không có quyền xóa bình luận này');

      const stillExists = await ctx.dataSource
        .getRepository(Comment)
        .findOne({ where: { id: comment.id } });
      expect(stillExists).not.toBeNull();
    });
  });
});
