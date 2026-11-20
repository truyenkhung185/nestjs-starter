import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service.js';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let mockArticleRepo: any;
  let mockFavoriteRepo: any;
  let mockUserFollowRepo: any;
  let mockUserRepo: any;

  beforeEach(() => {
    mockArticleRepo = {
      create: vi.fn((data) => ({ ...data, id: 'article-id-123', favoritesCount: 0 })),
      save: vi.fn((art) => Promise.resolve(art)),
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      remove: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    mockFavoriteRepo = {
      create: vi.fn((data) => ({ ...data, id: 'fav-id-123' })),
      save: vi.fn((fav) => Promise.resolve(fav)),
      findOne: vi.fn(),
      find: vi.fn(),
      remove: vi.fn(),
    };

    mockUserFollowRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
    };

    mockUserRepo = {
      findOne: vi.fn(),
    };

    service = new ArticlesService(
      mockArticleRepo,
      mockFavoriteRepo,
      mockUserFollowRepo,
      mockUserRepo,
    );
  });

  describe('createArticle', () => {
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

    it('should allow author to update article and regenerate slug on title change', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'old-slug-12345678',
        title: 'Old Title',
        body: 'Old Body',
        authorId: 'author-owner',
        author: { id: 'author-owner', email: 'owner@example.com' },
      };

      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockFavoriteRepo.findOne.mockResolvedValue(null);
      mockUserFollowRepo.findOne.mockResolvedValue(null);

      const result = await service.updateArticle(
        'old-slug-12345678',
        'author-owner',
        'user',
        { title: 'New Brand Title' },
      );

      expect(result.title).toBe('New Brand Title');
      expect(result.slug).toMatch(/^new-brand-title-[a-f0-9]{8}$/);
      expect(mockArticleRepo.save).toHaveBeenCalled();
    });

    it('should allow admin to update any article', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'some-slug-12345678',
        title: 'Title',
        body: 'Old Body',
        authorId: 'author-owner',
        author: { id: 'author-owner', email: 'owner@example.com' },
      };

      mockArticleRepo.findOne.mockResolvedValue(mockArticle);

      const result = await service.updateArticle(
        'some-slug-12345678',
        'admin-user',
        'admin',
        { body: 'Admin updated content' },
      );

      expect(result.body).toBe('Admin updated content');
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
      expect(result.message).toBe('Article successfully deleted');
    });
  });

  describe('favorite & unfavorite', () => {
    it('should favorite an article and increment count', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'fav-slug',
        favoritesCount: 0,
        authorId: 'author-1',
        author: { id: 'author-1', email: 'a@example.com' },
      };
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockFavoriteRepo.findOne.mockResolvedValue(null);

      const result = await service.favoriteArticle('fav-slug', 'user-1');

      expect(mockFavoriteRepo.save).toHaveBeenCalled();
      expect(mockArticle.favoritesCount).toBe(1);
      expect(result.favorited).toBe(true);
    });

    it('should unfavorite an article and decrement count', async () => {
      const mockArticle = {
        id: 'art-1',
        slug: 'fav-slug',
        favoritesCount: 2,
        authorId: 'author-1',
        author: { id: 'author-1', email: 'a@example.com' },
      };
      const existingFav = { id: 'fav-1', userId: 'user-1', articleId: 'art-1' };

      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockFavoriteRepo.findOne.mockResolvedValue(existingFav);

      const result = await service.unfavoriteArticle('fav-slug', 'user-1');

      expect(mockFavoriteRepo.remove).toHaveBeenCalledWith(existingFav);
      expect(mockArticle.favoritesCount).toBe(1);
      expect(result.favorited).toBe(false);
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
