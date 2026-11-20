import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentAccess } from './entities/attachment.entity.js';

vi.mock('fs', async () => {
  const actual: any = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    promises: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let mockAttachmentRepo: any;

  beforeEach(() => {
    mockAttachmentRepo = {
      create: vi.fn((data) => ({ ...data, id: 'att-uuid-123' })),
      save: vi.fn((att) => Promise.resolve(att)),
      findOne: vi.fn(),
      find: vi.fn(),
      delete: vi.fn(),
    };

    service = new AttachmentsService(mockAttachmentRepo);
  });

  describe('saveAttachment', () => {
    it('should save a public attachment and create db record', async () => {
      const mockFile: any = {
        originalname: 'avatar.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('fake-data'),
      };

      const result = await service.saveAttachment({
        file: mockFile,
        attachableType: 'UserAvatar',
        attachableId: 'user-uuid-1',
        uploaderId: 'user-uuid-1',
        accessType: AttachmentAccess.PUBLIC,
      });

      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(mockAttachmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'avatar.png',
          fileType: 'image/png',
          fileSize: 1024,
          accessType: AttachmentAccess.PUBLIC,
          attachableType: 'UserAvatar',
          attachableId: 'user-uuid-1',
        }),
      );
      expect(result.url).toMatch(/^\/public\//);
    });

    it('should save a private attachment with private endpoint url', async () => {
      const mockFile: any = {
        originalname: 'secret.png',
        mimetype: 'image/png',
        size: 2048,
        buffer: Buffer.from('secret-data'),
      };

      const result = await service.saveAttachment({
        file: mockFile,
        attachableType: 'UserAvatar',
        attachableId: 'user-uuid-1',
        uploaderId: 'user-uuid-1',
        accessType: AttachmentAccess.PRIVATE,
      });

      expect(result.url).toMatch(/^\/api\/attachments\/private\/stream\//);
      expect(result.accessType).toBe(AttachmentAccess.PRIVATE);
    });
  });

  describe('getPrivateAttachmentFile', () => {
    it('should throw ForbiddenException if requester is neither owner nor admin', async () => {
      mockAttachmentRepo.findOne.mockResolvedValue({
        id: 'att-1',
        uploaderId: 'owner-id',
        attachableId: 'owner-id',
        storagePath: '/uploads/private/file.png',
      });

      await expect(
        service.getPrivateAttachmentFile('att-1', 'intruder-id', 'user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow entity owner to access private file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockAttachmentRepo.findOne.mockResolvedValue({
        id: 'att-1',
        uploaderId: 'owner-id',
        attachableId: 'owner-id',
        storagePath: '/uploads/private/file.png',
      });

      const result = await service.getPrivateAttachmentFile(
        'att-1',
        'owner-id',
        'user',
      );

      expect(result.filePath).toBe('/uploads/private/file.png');
    });

    it('should allow admin to access private file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockAttachmentRepo.findOne.mockResolvedValue({
        id: 'att-1',
        uploaderId: 'owner-id',
        attachableId: 'owner-id',
        storagePath: '/uploads/private/file.png',
      });

      const result = await service.getPrivateAttachmentFile(
        'att-1',
        'admin-id',
        'admin',
      );

      expect(result.filePath).toBe('/uploads/private/file.png');
    });

    it('should throw NotFoundException if physical file is missing from disk', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      mockAttachmentRepo.findOne.mockResolvedValue({
        id: 'att-1',
        uploaderId: 'owner-id',
        attachableId: 'owner-id',
        storagePath: '/uploads/private/non-existent.png',
      });

      await expect(
        service.getPrivateAttachmentFile('att-1', 'owner-id', 'user'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
