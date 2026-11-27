import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { User, UserRole } from '../../src/users/entities/user.entity.js';
import { UserFollow } from '../../src/users/entities/user-follow.entity.js';
import { Article } from '../../src/articles/entities/article.entity.js';
import { Comment } from '../../src/comments/entities/comment.entity.js';
import { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface.js';

export interface FakeUserResult {
  user: User;
  rawPassword: string;
}

export async function createFakeUser(
  dataSource: DataSource,
  overrides: Partial<User> & { rawPassword?: string } = {},
): Promise<FakeUserResult> {
  const userRepo = dataSource.getRepository(User);
  const rawPassword = overrides.rawPassword ?? 'TestPass123!';
  const hashedPassword = await bcrypt.hash(rawPassword, 4);

  const user = userRepo.create({
    email: overrides.email ?? faker.internet.email().toLowerCase(),
    password: overrides.password ?? hashedPassword,
    fullName: overrides.fullName ?? faker.person.fullName(),
    bio: overrides.bio ?? faker.lorem.sentence(),
    avatarUrl: overrides.avatarUrl ?? null,
    role: overrides.role ?? UserRole.USER,
    isActive: overrides.isActive ?? true,
  });

  const saved = await userRepo.save(user);
  return { user: saved, rawPassword };
}

export async function createFakeArticle(
  dataSource: DataSource,
  authorId: string,
  overrides: Partial<Article> = {},
): Promise<Article> {
  const articleRepo = dataSource.getRepository(Article);
  const title = overrides.title ?? faker.lorem.sentence(5);
  const suffix = crypto.randomBytes(4).toString('hex');
  const slug =
    overrides.slug ??
    `${faker.helpers.slugify(title).toLowerCase().replace(/[^a-z0-9-]/g, '')}-${suffix}`;

  const article = articleRepo.create({
    title,
    slug,
    description: overrides.description ?? faker.lorem.sentence(),
    body: overrides.body ?? faker.lorem.paragraphs(2),
    tagList: overrides.tagList ?? [faker.word.noun().toLowerCase()],
    authorId,
    favoritesCount: overrides.favoritesCount ?? 0,
  });

  return await articleRepo.save(article);
}

export async function createFakeComment(
  dataSource: DataSource,
  articleId: string,
  authorId: string,
  overrides: Partial<Comment> = {},
): Promise<Comment> {
  const commentRepo = dataSource.getRepository(Comment);

  const comment = commentRepo.create({
    body: overrides.body ?? faker.lorem.sentence(),
    articleId,
    authorId,
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
  });

  return await commentRepo.save(comment);
}

export async function createFakeFollow(
  dataSource: DataSource,
  followerId: string,
  followingId: string,
): Promise<UserFollow> {
  const followRepo = dataSource.getRepository(UserFollow);
  const follow = followRepo.create({ followerId, followingId });
  return await followRepo.save(follow);
}

export async function loginAs(
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return res.body.tokens.accessToken as string;
}

export async function signTestToken(
  jwtService: JwtService,
  configService: ConfigService,
  user: Pick<User, 'id' | 'email' | 'role'>,
  expiresIn: string = '15m',
): Promise<string> {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    jti: crypto.randomUUID(),
  };

  return await jwtService.signAsync(payload, {
    secret: configService.getOrThrow<string>('JWT_SECRET'),
    expiresIn: expiresIn as any,
  });
}
