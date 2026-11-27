import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { QueryCommentsDto } from './dto/query-comments.dto.js';
import { UserRole } from '../users/entities/user.entity.js';

describe('CommentsService', () => {
  let service: CommentsService;
  let mockCommentRepo: any;
  let mockArticleRepo: any;
  let mockUserRepo: any;
  let mockUserFollowRepo: any;
  let mockI18n: any;

  const mockAuthor = {
    id: 'author-1',
    email: 'author@example.com',
    fullName: 'Author One',
    bio: 'Developer',
    avatarUrl: '/public/avatar.png',
  };

  const mockArticle = {
    id: 'article-1',
    slug: 'nestjs-guide-12345678',
    title: 'NestJS Guide',
  };

  beforeEach(() => {
    mockCommentRepo = {
      create: vi.fn((data) => ({
        ...data,
        id: 'comment-uuid-1',
        createdAt: new Date('2026-11-25T10:00:00Z'),
        updatedAt: new Date('2026-11-25T10:00:00Z'),
      })),
      save: vi.fn((comment) => Promise.resolve(comment)),
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    mockArticleRepo = {
      findOne: vi.fn(),
    };

    mockUserRepo = {
      findOne: vi.fn(),
    };

    mockUserFollowRepo = {
      find: vi.fn(),
    };

    mockI18n = {
      t: vi.fn((key: string) => key),
    };

    service = new CommentsService(
      mockCommentRepo,
      mockArticleRepo,
      mockUserRepo,
      mockUserFollowRepo,
      mockI18n,
    );
  });

  describe('addComment', () => {
    it('should add a comment to an article and return formatted comment without author email', async () => {
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockUserRepo.findOne.mockResolvedValue(mockAuthor);

      const result = await service.addComment('nestjs-guide-12345678', 'author-1', {
        body: 'Very helpful article!',
      });

      expect(mockCommentRepo.create).toHaveBeenCalledWith({
        body: 'Very helpful article!',
        articleId: 'article-1',
        authorId: 'author-1',
      });
      expect(mockCommentRepo.save).toHaveBeenCalled();
      expect(result.id).toBe('comment-uuid-1');
      expect(result.body).toBe('Very helpful article!');
      expect(result.author).toEqual({
        id: 'author-1',
        fullName: 'Author One',
        bio: 'Developer',
        avatarUrl: '/public/avatar.png',
        following: false,
      });
      expect(result.author).not.toHaveProperty('email');
    });

    it('should throw NotFoundException if article does not exist', async () => {
      mockArticleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addComment('missing-slug', 'author-1', { body: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if author does not exist', async () => {
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addComment('nestjs-guide-12345678', 'deleted-user', { body: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException on concurrent FK violation (23503)', async () => {
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockUserRepo.findOne.mockResolvedValue(mockAuthor);
      mockCommentRepo.save.mockRejectedValue({ code: '23503' });

      await expect(
        service.addComment('nestjs-guide-12345678', 'author-1', { body: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getComments', () => {
    it('should pass pagination & deterministic order to findAndCount and return accurate following status without email', async () => {
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      const comment1 = {
        id: 'comment-1',
        body: 'First comment',
        articleId: 'article-1',
        authorId: 'author-1',
        author: mockAuthor,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const comment2 = {
        id: 'comment-2',
        body: 'Second comment',
        articleId: 'article-1',
        authorId: 'author-2',
        author: {
          id: 'author-2',
          email: 'author2@example.com',
          fullName: 'Author Two',
          bio: null,
          avatarUrl: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommentRepo.findAndCount.mockResolvedValue([[comment1, comment2], 2]);
      mockUserFollowRepo.find.mockResolvedValue([
        { followerId: 'viewer-1', followingId: 'author-1' },
      ]);

      const result = await service.getComments(
        'nestjs-guide-12345678',
        { limit: 10, offset: 5 },
        'viewer-1',
      );

      expect(mockCommentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { articleId: 'article-1' },
          relations: { author: true },
          order: { createdAt: 'DESC', id: 'DESC' },
          skip: 5,
          take: 10,
        }),
      );
      expect(result.commentsCount).toBe(2);
      expect(result.comments).toHaveLength(2);
      expect(result.comments[0].author.following).toBe(true);
      expect(result.comments[1].author.following).toBe(false);
      expect(result.comments[0].author).not.toHaveProperty('email');
      expect(result.comments[1].author).not.toHaveProperty('email');
      expect(mockUserFollowRepo.find).toHaveBeenCalledTimes(1);
    });

    it('should apply default pagination and return following=false for unauthenticated guest without querying follows', async () => {
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      const comment = {
        id: 'comment-1',
        body: 'Guest view comment',
        articleId: 'article-1',
        authorId: 'author-1',
        author: mockAuthor,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommentRepo.findAndCount.mockResolvedValue([[comment], 1]);

      const result = await service.getComments('nestjs-guide-12345678', {});

      expect(mockCommentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { articleId: 'article-1' },
          relations: { author: true },
          order: { createdAt: 'DESC', id: 'DESC' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.commentsCount).toBe(1);
      expect(result.comments[0].author.following).toBe(false);
      expect(result.comments[0].author).not.toHaveProperty('email');
      expect(mockUserFollowRepo.find).not.toHaveBeenCalled();
    });

    it('should return empty list without querying follows when article has no comments', async () => {
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockCommentRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getComments('nestjs-guide-12345678', {}, 'viewer-1');

      expect(result).toEqual({ comments: [], commentsCount: 0 });
      expect(mockUserFollowRepo.find).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if article does not exist', async () => {
      mockArticleRepo.findOne.mockResolvedValue(null);

      await expect(service.getComments('missing-slug')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteComment', () => {
    it('should allow comment author to delete their comment', async () => {
      const existingComment = {
        id: 'comment-1',
        articleId: 'article-1',
        authorId: 'author-1',
      };
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockCommentRepo.findOne.mockResolvedValue(existingComment);

      const result = await service.deleteComment(
        'nestjs-guide-12345678',
        'comment-1',
        'author-1',
        UserRole.USER,
      );

      expect(mockCommentRepo.remove).toHaveBeenCalledWith(existingComment);
      expect(result.message).toBeDefined();
    });

    it('should allow admin (UserRole.ADMIN) to delete any comment', async () => {
      const existingComment = {
        id: 'comment-1',
        articleId: 'article-1',
        authorId: 'author-1',
      };
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockCommentRepo.findOne.mockResolvedValue(existingComment);

      const result = await service.deleteComment(
        'nestjs-guide-12345678',
        'comment-1',
        'admin-user',
        UserRole.ADMIN,
      );

      expect(mockCommentRepo.remove).toHaveBeenCalledWith(existingComment);
      expect(result.message).toBeDefined();
    });

    it('should throw ForbiddenException if another non-admin user tries to delete', async () => {
      const existingComment = {
        id: 'comment-1',
        articleId: 'article-1',
        authorId: 'author-1',
      };
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockCommentRepo.findOne.mockResolvedValue(existingComment);

      await expect(
        service.deleteComment(
          'nestjs-guide-12345678',
          'comment-1',
          'other-user',
          UserRole.USER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if article does not exist', async () => {
      mockArticleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteComment('missing-slug', 'comment-1', 'author-1', UserRole.USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if comment does not exist or belongs to another article', async () => {
      mockArticleRepo.findOne.mockResolvedValue(mockArticle);
      mockCommentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteComment(
          'nestjs-guide-12345678',
          'other-article-comment-id',
          'author-1',
          UserRole.USER,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DTO Validation', () => {
    it('should reject empty or whitespace-only comment body', async () => {
      const dto = plainToInstance(CreateCommentDto, { body: '    ' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should trim valid comment body and pass validation', async () => {
      const dto = plainToInstance(CreateCommentDto, { body: '  Nice post!  ' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.body).toBe('Nice post!');
    });

    it('should reject negative offset or invalid limit in QueryCommentsDto', async () => {
      const dto = plainToInstance(QueryCommentsDto, { limit: 0, offset: -1 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
