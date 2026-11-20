import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UserRole } from './entities/user.entity.js';
import { AttachmentAccess } from '../attachments/entities/attachment.entity.js';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserRepo: any;
  let mockUserFollowRepo: any;
  let mockAttachmentsService: any;

  beforeEach(() => {
    mockUserRepo = {
      create: vi.fn((data) => ({ ...data, id: 'user-id-123' })),
      save: vi.fn((user) => Promise.resolve(user)),
      findOne: vi.fn(),
      update: vi.fn(),
    };

    mockUserFollowRepo = {
      create: vi.fn((data) => ({ ...data, id: 'follow-id-123' })),
      save: vi.fn((follow) => Promise.resolve(follow)),
      findOne: vi.fn(),
      count: vi.fn(),
      remove: vi.fn(),
    };

    mockAttachmentsService = {
      saveAttachment: vi.fn(),
      deleteByAttachable: vi.fn(),
    };

    service = new UsersService(
      mockUserRepo,
      mockUserFollowRepo,
      mockAttachmentsService,
    );
  });

  describe('updateUser', () => {
    it('should update fullName and bio without file', async () => {
      const mockUser = {
        id: 'user-1',
        fullName: 'Old Name',
        bio: 'Old Bio',
        avatarUrl: null,
      };
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.updateUser('user-1', {
        fullName: 'New Name',
        bio: 'New Bio',
      });

      expect(result.fullName).toBe('New Name');
      expect(result.bio).toBe('New Bio');
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if avatar file has invalid mime type', async () => {
      const mockUser = { id: 'user-1' };
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const invalidFile: any = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
      };

      await expect(
        service.updateUser('user-1', {}, invalidFile),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if avatar file exceeds 5MB', async () => {
      const mockUser = { id: 'user-1' };
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const largeFile: any = {
        originalname: 'large.jpg',
        mimetype: 'image/jpeg',
        size: 6 * 1024 * 1024,
        buffer: Buffer.from('test'),
      };

      await expect(
        service.updateUser('user-1', {}, largeFile),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully upload public avatar and update user avatarUrl', async () => {
      const mockUser = { id: 'user-1', avatarUrl: null };
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const validFile: any = {
        originalname: 'avatar.png',
        mimetype: 'image/png',
        size: 50000,
        buffer: Buffer.from('png data'),
      };

      mockAttachmentsService.saveAttachment.mockResolvedValue({
        id: 'att-1',
        url: '/public/uuid.png',
        accessType: AttachmentAccess.PUBLIC,
      });

      const result = await service.updateUser('user-1', {}, validFile, false);

      expect(mockAttachmentsService.deleteByAttachable).toHaveBeenCalledWith(
        'UserAvatar',
        'user-1',
      );
      expect(mockAttachmentsService.saveAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          attachableType: 'UserAvatar',
          attachableId: 'user-1',
          accessType: AttachmentAccess.PUBLIC,
        }),
      );
      expect(result.avatarUrl).toBe('/public/uuid.png');
    });

    it('should successfully upload private avatar with secure url', async () => {
      const mockUser = { id: 'user-1', avatarUrl: null };
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const validFile: any = {
        originalname: 'avatar.png',
        mimetype: 'image/png',
        size: 50000,
        buffer: Buffer.from('png data'),
      };

      mockAttachmentsService.saveAttachment.mockResolvedValue({
        id: 'att-2',
        url: '/api/attachments/private/stream/uuid.png',
        accessType: AttachmentAccess.PRIVATE,
      });

      const result = await service.updateUser('user-1', {}, validFile, true);

      expect(mockAttachmentsService.saveAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          accessType: AttachmentAccess.PRIVATE,
        }),
      );
      expect(result.avatarUrl).toBe('/api/attachments/private/stream/uuid.png');
    });
  });

  describe('getProfile', () => {
    it('should return user profile with followersCount, followingCount and isFollowing', async () => {
      const mockUser = {
        id: 'user-2',
        email: 'user2@example.com',
        fullName: 'User Two',
        bio: 'Bio',
        avatarUrl: '/public/avatar.jpg',
        role: UserRole.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockUserFollowRepo.count
        .mockResolvedValueOnce(10) // followers
        .mockResolvedValueOnce(5); // following

      mockUserFollowRepo.findOne.mockResolvedValue({ id: 'follow-1' });

      const profile = await service.getProfile('user-2', 'viewer-user-1');

      expect(profile.id).toBe('user-2');
      expect(profile.followersCount).toBe(10);
      expect(profile.followingCount).toBe(5);
      expect(profile.isFollowing).toBe(true);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.getProfile('non-existent-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('followUser', () => {
    it('should throw BadRequestException when trying to follow oneself', async () => {
      await expect(service.followUser('user-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if already following', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'user-2', isActive: true });
      mockUserFollowRepo.findOne.mockResolvedValue({ id: 'follow-1' });

      await expect(service.followUser('user-1', 'user-2')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should successfully follow another user', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-2',
        fullName: 'Target User',
        isActive: true,
      });
      mockUserFollowRepo.findOne.mockResolvedValue(null);

      const result = await service.followUser('user-1', 'user-2');

      expect(mockUserFollowRepo.save).toHaveBeenCalled();
      expect(result.message).toContain('Successfully followed Target User');
    });
  });

  describe('unfollowUser', () => {
    it('should throw BadRequestException if not following the user', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'user-2' });
      mockUserFollowRepo.findOne.mockResolvedValue(null);

      await expect(service.unfollowUser('user-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully unfollow a user', async () => {
      const existingFollow = { id: 'follow-1' };
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-2',
        fullName: 'Target User',
      });
      mockUserFollowRepo.findOne.mockResolvedValue(existingFollow);

      const result = await service.unfollowUser('user-1', 'user-2');

      expect(mockUserFollowRepo.remove).toHaveBeenCalledWith(existingFollow);
      expect(result.message).toContain('Successfully unfollowed Target User');
    });
  });
});
