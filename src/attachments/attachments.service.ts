import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { Attachment, AttachmentAccess } from './entities/attachment.entity.js';
import { UserRole } from '../users/entities/user.entity.js';
import { MIME_TO_EXTENSION } from '../users/constants/user.constants.js';

export interface SaveAttachmentOptions {
  file: Express.Multer.File;
  attachableType: string;
  attachableId: string;
  uploaderId?: string;
  accessType?: AttachmentAccess;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly uploadRootDir = path.join(process.cwd(), 'uploads');
  private readonly publicDir = path.join(this.uploadRootDir, 'public');
  private readonly privateDir = path.join(this.uploadRootDir, 'private');

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    private readonly i18n: I18nService,
  ) {
    this.ensureDirectoriesExist();
  }

  private ensureDirectoriesExist(): void {
    if (!fs.existsSync(this.publicDir)) {
      fs.mkdirSync(this.publicDir, { recursive: true });
    }
    if (!fs.existsSync(this.privateDir)) {
      fs.mkdirSync(this.privateDir, { recursive: true });
    }
  }

  async saveAttachment(options: SaveAttachmentOptions): Promise<Attachment> {
    const {
      file,
      attachableType,
      attachableId,
      uploaderId,
      accessType = AttachmentAccess.PUBLIC,
    } = options;

    // Secure: ONLY deduce extension from verified whitelist mapping, NEVER from originalname
    const safeExtension = MIME_TO_EXTENSION[file.mimetype];
    if (!safeExtension) {
      throw new BadRequestException(
        this.i18n.t('users.INVALID_AVATAR_TYPE') || 'Unsupported file type',
      );
    }

    const uniqueId = crypto.randomUUID();
    const uniqueFileName = `${uniqueId}${safeExtension}`;
    const targetFolder =
      accessType === AttachmentAccess.PUBLIC ? this.publicDir : this.privateDir;
    const fullStoragePath = path.join(targetFolder, uniqueFileName);

    // Save physical file
    await fs.promises.writeFile(fullStoragePath, file.buffer);

    try {
      const attachment = this.attachmentRepository.create({
        id: uniqueId,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        storagePath: fullStoragePath,
        url:
          accessType === AttachmentAccess.PUBLIC
            ? `/public/${uniqueFileName}`
            : `/attachments/private/${uniqueId}/download`,
        accessType,
        attachableType,
        attachableId,
        uploaderId: uploaderId || null,
      });

      return await this.attachmentRepository.save(attachment);
    } catch (dbErr) {
      // Rollback physical file if DB insert fails
      if (fs.existsSync(fullStoragePath)) {
        await fs.promises.unlink(fullStoragePath).catch(() => {});
      }
      throw dbErr;
    }
  }

  async findById(id: string): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException(
        this.i18n.t('users.ATTACHMENT_NOT_FOUND', { args: { id } }) ||
          `Attachment with ID ${id} not found`,
      );
    }
    return attachment;
  }

  async findByAttachable(
    attachableType: string,
    attachableId: string,
  ): Promise<Attachment[]> {
    return await this.attachmentRepository.find({
      where: { attachableType, attachableId },
      order: { createdAt: 'DESC' },
    });
  }

  async getPrivateAttachmentFile(
    attachmentId: string,
    requesterId: string,
    requesterRole?: string,
  ): Promise<{ attachment: Attachment; filePath: string }> {
    const attachment = await this.findById(attachmentId);

    const isOwner =
      attachment.uploaderId === requesterId ||
      attachment.attachableId === requesterId;
    const isAdmin = requesterRole === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        this.i18n.t('users.FORBIDDEN_FILE_ACCESS') ||
          'You do not have permission to access this private file',
      );
    }

    if (!fs.existsSync(attachment.storagePath)) {
      throw new NotFoundException(
        this.i18n.t('users.PHYSICAL_FILE_NOT_FOUND') ||
          'The requested physical file was not found on server',
      );
    }

    return {
      attachment,
      filePath: attachment.storagePath,
    };
  }

  async deleteAttachments(attachments: Attachment[]): Promise<void> {
    for (const att of attachments) {
      if (fs.existsSync(att.storagePath)) {
        try {
          await fs.promises.unlink(att.storagePath);
        } catch (err: any) {
          this.logger.warn(`Could not delete file ${att.storagePath}: ${err.message}`);
        }
      }
      await this.attachmentRepository.delete(att.id);
    }
  }

  async deleteByAttachable(
    attachableType: string,
    attachableId: string,
  ): Promise<void> {
    const attachments = await this.findByAttachable(attachableType, attachableId);
    await this.deleteAttachments(attachments);
  }
}
