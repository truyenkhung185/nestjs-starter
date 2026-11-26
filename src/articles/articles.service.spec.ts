import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ArticlesService } from './articles.service.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { UserRole } from '../users/entities/user.entity.js';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let mockArticleRepo: any;
  let mockFavoriteRepo: any;
  let mockUserFollowRepo: any;
  let mockUserRepo: any;
  let mockI18n: any;
  let mockQb: any;

  beforeEach(() => {
    mockQb = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
    };

    mockArticleRepo = {
      create: vi.fn((data) => ({ ...data, id: 'article-id-123', favoritesCount: 0 })),
      save: vi.fn((art) => Promise.resolve(art)),
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      remove: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      increment: vi.fn().mockResolvedValue(undefined),
      decrement: vi.fn().mockResolvedValue(undefined),
      createQueryBuilder: vi.fn(() => mockQb),
    };

    mockFavoriteRepo = {
      create: vi.fn((data) => ({ ...data, id: 'fav-id-123' })),
      save: vi.fn((fav) => Promise.resolve(fav)),
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      remove: vi.fn(),
    };

    mockUserFollowRepo = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
    };

    mockUserRepo = {
      findOne: vi.fn(),
    };

    mockI18n = {
      t: vi.fn((key: string) => key),
    };

    service = new ArticlesService(
      mockArticleRepo,
      mockFavoriteRepo,
      mockUserFollowRepo,
      mockUserRepo,
      mockI18n,
    );
  });

  describe('createArticle & slugify', () => {
    it('should generate a unique slug and save article', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'author-1',
        email: 'author@example.com',
        fullName: 'Author One',
      });

      const result = await service.createArticle('author-1', {
        title: 'Learn NestJS In Depth',
        description: 'Guide',
        body: 'Full content',
        tagList: ['nestjs', 'backend'],
      });

      expect(result.slug).toMatch(/^learn-nestjs-in-depth-[a-f0-9]{8}$/);
      expect(result.title).toBe('Learn NestJS In Depth');
      expect(result.tagList).toEqual(['nestjs', 'backend']);
      expect(result.author.id).toBe('author-1');
      expect(mockArticleRepo.save).toHaveBeenCalled();
    });

    it('should properly normalize Vietnamese diacritics and đ/Đ in slug', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'author-1',
        email: 'author@example.com',
        fullName: 'Author One',
      });

      const res1 = await service.createArticle('author-1', {
        title: 'Học NestJS cơ bản',
        body: 'Nội dung',
      });
      expect(res1.slug).toMatch(/^hoc-nestjs-co-ban-[a-f0-9]{8}$/);

      const res2 = await service.createArticle('author-1', {
        title: 'Đi học Đắk Lắk',
        body: 'Nội dung',
      });
      expect(res2.slug).toMatch(/^di-hoc-dak-lak-[a-f0-9]{8}$/);
    });

    it('should not produce a leading hyphen when title has only symbols', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'author-1',
        email: 'author@example.com',
        fullName: 'Author One',
      });

      const res = await service.createArticle('author-1', {
        title: '!!!@@@',
        body: 'Body',
      });
      expect(res.slug).toMatch(/^[a-f0-9]{8}$/);
    });
  });

  describe('listArticles', () => {
    const sampleArticle = {
      id: 'art-1',
      slug: 'nestjs-post-12345678',
      title: 'NestJS Post',
      description: 'Desc',
      body: 'Body',
      tagList: ['nestjs'],
      favoritesCount: 1,
      authorId: 'author-1',
      author: {
        id: 'author-1',
        email: 'author@example.com',
        fullName: 'Author',
        bio: null,
        avatarUrl: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should apply deterministic ordering (createdAt DESC, id DESC) and pagination', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[sampleArticle], 1]);

      const result = await service.listArticles({ limit: 5, offset: 10 });

      expect(mockQb.orderBy).toHaveBeenCalledWith('article.createdAt', 'DESC');
      expect(mockQb.addOrderBy).toHaveBeenCalledWith('article.id', 'DESC');
      expect(mockQb.skip).toHaveBeenCalledWith(10);
      expect(mockQb.take).toHaveBeenCalledWith(5);
      expect(result.articlesCount).toBe(1);
      expect(result.articles).toHaveLength(1);
    });

    it('should filter by tag and author email', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[sampleArticle], 1]);

      await service.listArticles({ tag: 'nestjs', author: 'author@example.com' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(':tag = ANY(article.tagList)', {
        tag: 'nestjs',
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith('author.email = :authorEmail', {
        authorEmail: 'author@example.com',
      });
    });

    it('should filter by favorited using email without UUID comparison', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'fan-uuid-1', email: 'fan@example.com' });
      mockQb.getManyAndCount.mockResolvedValue([[sampleArticle], 1]);

      await service.listArticles({ favorited: 'fan@example.com' });

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'fan@example.com' },
      });
      expect(mockQb.innerJoin).toHaveBeenCalledWith(
        'article_favorites',
        'favFilter',
        'favFilter.article_id = article.id AND favFilter.user_id = :favUserId',
        { favUserId: 'fan-uuid-1' },
      );
    });

    it('should filter by favorited using UUID when valid UUID is provided', async () => {
      const fanUuid = '123e4567-e89b-12d3-a456-426614174000';
      mockUserRepo.findOne.mockResolvedValue({ id: fanUuid, email: 'fan@example.com' });
      mockQb.getManyAndCount.mockResolvedValue([[sampleArticle], 1]);

      await service.listArticles({ favorited: fanUuid });

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({
        where: { id: fanUuid },
      });
      expect(mockQb.innerJoin).toHaveBeenCalledWith(
        'article_favorites',
        'favFilter',
        'favFilter.article_id = article.id AND favFilter.user_id = :favUserId',
        { favUserId: fanUuid },
      );
    });

    it('should return empty result immediately when favorited user does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const result = await service.listArticles({ favorited: 'nobody@example.com' });

      expect(result).toEqual({ articles: [], articlesCount: 0 });
      expect(mockQb.getManyAndCount).not.toHaveBeenCalled();
    });
  });

  describe('getArticleBySlug', () => {
    it('should return article with favorited and following status', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'my-first-post-12345678',
        title: 'My First Post',
        description: 'Desc',
        body: 'Body',
        tagList: ['test'],
        favoritesCount: 3,
        authorId: 'author-1',
        author: { id: 'author-1', email: 'author@example.com' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockFavoriteRepo.findOne.mockResolvedValue({ id: 'fav-1' });
      mockUserFollowRepo.findOne.mockResolvedValue({ id: 'follow-1' });

      const result = await service.getArticleBySlug('my-first-post-12345678', 'viewer-user-1');

      expect(result.slug).toBe('my-first-post-12345678');
      expect(result.favorited).toBe(true);
      expect(result.author.following).toBe(true);
    });

    it('should throw NotFoundException if article slug does not exist', async () => {
      mockArticleRepo.findOne.mockResolvedValue(null);

      await expect(service.getArticleBySlug('non-existent-slug')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateArticle', () => {
    it('should throw ForbiddenException if user is not author and not admin', async () => {
      mockArticleRepo.findOne.mockResolvedValue({
        id: 'art-1',
        slug: 'test-slug',
        authorId: 'author-owner',
      });

      await expect(
        service.updateArticle('test-slug', 'other-user', 'user', { title: 'New Title' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow author to update article and use partial update', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'old-slug-12345678',
        title: 'Old Title',
        body: 'Old Body',
        authorId: 'author-owner',
        author: { id: 'author-owner', email: 'owner@example.com' },
      };

      const updatedArticle = {
        ...mockArticle,
        title: 'New Brand Title',
        slug: 'new-brand-title-12345678',
      };

      mockArticleRepo.findOne
        .mockResolvedValueOnce(mockArticle)
        .mockResolvedValueOnce(updatedArticle);
      mockFavoriteRepo.findOne.mockResolvedValue(null);
      mockUserFollowRepo.findOne.mockResolvedValue(null);

      const result = await service.updateArticle(
        'old-slug-12345678',
        'author-owner',
        'user',
        { title: 'New Brand Title' },
      );

      expect(result.title).toBe('New Brand Title');
      expect(mockArticleRepo.update).toHaveBeenCalled();
    });

    it('should allow admin (UserRole.ADMIN) to update any article', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'some-slug-12345678',
        title: 'Title',
        body: 'Old Body',
        authorId: 'author-owner',
        author: { id: 'author-owner', email: 'owner@example.com' },
      };

      mockArticleRepo.findOne
        .mockResolvedValueOnce(mockArticle)
        .mockResolvedValueOnce({ ...mockArticle, body: 'Admin updated content' });

      const result = await service.updateArticle(
        'some-slug-12345678',
        'admin-user',
        UserRole.ADMIN,
        { body: 'Admin updated content' },
      );

      expect(result.body).toBe('Admin updated content');
    });
  });

  describe('UpdateArticleDto validation', () => {
    it('should reject empty or whitespace-only title and body', async () => {
      const dto = plainToInstance(UpdateArticleDto, { title: '   ', body: '' });
      const errors = await validate(dto);
      const errorProps = errors.map((e) => e.property);
      expect(errorProps).toContain('title');
      expect(errorProps).toContain('body');
    });

    it('should reject null for title, body, and tagList', async () => {
      const dto = plainToInstance(UpdateArticleDto, {
        title: null,
        body: null,
        tagList: null,
      });
      const errors = await validate(dto);
      const errorProps = errors.map((e) => e.property);
      expect(errorProps).toContain('title');
      expect(errorProps).toContain('body');
      expect(errorProps).toContain('tagList');
    });

    it('should pass valid partial update when only title is supplied', async () => {
      const dto = plainToInstance(UpdateArticleDto, { title: '  Updated Title  ' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.title).toBe('Updated Title');
    });
  });

  describe('deleteArticle', () => {
    it('should throw ForbiddenException if user is not author or admin', async () => {
      mockArticleRepo.findOne.mockResolvedValue({
        id: 'art-1',
        slug: 'test-slug',
        authorId: 'author-owner',
      });

      await expect(
        service.deleteArticle('test-slug', 'random-user', 'user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should successfully remove article when called by author', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'test-slug',
        authorId: 'author-owner',
      };
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);

      const result = await service.deleteArticle('test-slug', 'author-owner', 'user');

      expect(mockArticleRepo.remove).toHaveBeenCalledWith(mockArticle);
      expect(result.message).toBeDefined();
    });
  });

  describe('favorite & unfavorite', () => {
    it('should save favorite without double-incrementing favoritesCount (handled by DB trigger)', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'fav-slug',
        favoritesCount: 0,
        authorId: 'author-1',
        author: { id: 'author-1', email: 'a@example.com' },
      };
      mockArticleRepo.findOne
        .mockResolvedValueOnce(mockArticle)
        .mockResolvedValueOnce({ ...mockArticle, favoritesCount: 1 });
      mockFavoriteRepo.findOne.mockResolvedValue(null);

      const result = await service.favoriteArticle('fav-slug', 'user-1');

      expect(mockFavoriteRepo.save).toHaveBeenCalled();
      expect(mockArticleRepo.increment).not.toHaveBeenCalled();
      expect(result.favorited).toBe(true);
      expect(result.favoritesCount).toBe(1);
    });

    it('should remove favorite without double-decrementing favoritesCount (handled by DB trigger)', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'fav-slug',
        favoritesCount: 2,
        authorId: 'author-1',
        author: { id: 'author-1', email: 'a@example.com' },
      };
      const existingFav = { id: 'fav-1', userId: 'user-1', articleId: 'art-1' };

      mockArticleRepo.findOne
        .mockResolvedValueOnce(mockArticle)
        .mockResolvedValueOnce({ ...mockArticle, favoritesCount: 1 });
      mockFavoriteRepo.findOne.mockResolvedValue(existingFav);

      const result = await service.unfavoriteArticle('fav-slug', 'user-1');

      expect(mockFavoriteRepo.remove).toHaveBeenCalledWith(existingFav);
      expect(mockArticleRepo.decrement).not.toHaveBeenCalled();
      expect(result.favorited).toBe(false);
      expect(result.favoritesCount).toBe(1);
    });
  });

  describe('getFeed', () => {
    it('should return empty list if user follows nobody', async () => {
      mockUserFollowRepo.find.mockResolvedValue([]);

      const result = await service.getFeed('user-1');
      expect(result.articles).toEqual([]);
      expect(result.articlesCount).toBe(0);
    });
  });
});
