import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Attachment, AttachmentAccess } from './entities/attachment.entity.js';

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

    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueFileName = `${crypto.randomUUID()}${extension}`;
    const targetFolder =
      accessType === AttachmentAccess.PUBLIC ? this.publicDir : this.privateDir;
    const fullStoragePath = path.join(targetFolder, uniqueFileName);

    // Save file buffer to local disk
    await fs.promises.writeFile(fullStoragePath, file.buffer);

    // Generate url based on access type
    // Public: direct static access at /public/<filename>
    // Private: access through secure API endpoint at /api/attachments/private/<id>/download
    const url =
      accessType === AttachmentAccess.PUBLIC
        ? `/public/${uniqueFileName}`
        : `/api/attachments/private/stream/${uniqueFileName}`;

    const attachment = this.attachmentRepository.create({
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      storagePath: fullStoragePath,
      url,
      accessType,
      attachableType,
      attachableId,
      uploaderId: uploaderId || null,
    });

    return await this.attachmentRepository.save(attachment);
  }

  async findById(id: string): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
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

    // Access control:
    // If private: only the uploader, or the entity owner (attachableId), or admin can view
    const isOwner =
      attachment.uploaderId === requesterId ||
      attachment.attachableId === requesterId;
    const isAdmin = requesterRole === 'admin';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to access this private file',
      );
    }

    if (!fs.existsSync(attachment.storagePath)) {
      throw new NotFoundException('The requested physical file was not found on server');
    }

    return {
      attachment,
      filePath: attachment.storagePath,
    };
  }

  async deleteByAttachable(
    attachableType: string,
    attachableId: string,
  ): Promise<void> {
    const attachments = await this.findByAttachable(attachableType, attachableId);
    for (const att of attachments) {
      if (fs.existsSync(att.storagePath)) {
        try {
          await fs.promises.unlink(att.storagePath);
        } catch (err: any) {
          this.logger.warn(`Could not delete file ${att.storagePath}: ${err.message}`);
        }
      }
    }
    await this.attachmentRepository.delete({ attachableType, attachableId });
  }
}
