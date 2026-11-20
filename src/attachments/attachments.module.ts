import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentsController } from './attachments.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment])],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
