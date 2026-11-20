import {
  Controller,
  Get,
  Param,
  UseGuards,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AttachmentsService } from './attachments.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';

@ApiTags('Attachments')
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('private/:id/download')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Download a private attachment (Requires Authentication & Ownership/Admin)',
  })
  @ApiParam({ name: 'id', description: 'Attachment UUID' })
  @ApiResponse({ status: 200, description: 'File binary stream' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden (Not owner/admin)' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async downloadPrivateFile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { attachment, filePath } =
      await this.attachmentsService.getPrivateAttachmentFile(
        id,
        user.id,
        user.role,
      );

    res.setHeader('Content-Type', attachment.fileType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
    );
    res.sendFile(filePath);
  }
}
