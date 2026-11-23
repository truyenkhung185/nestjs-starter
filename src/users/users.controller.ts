import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  ParseUUIDPipe,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AVATAR_MAX_BYTES } from './constants/user.constants.js';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: {
        fileSize: AVATAR_MAX_BYTES,
      },
    }),
  )
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Update user profile (fullName, bio) and optionally upload avatar locally (public or private)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'private',
    required: false,
    type: Boolean,
    description:
      'If true, the avatar is stored privately and requires authenticated permission to view via API. Default is false (public folder).',
  })
  @ApiResponse({ status: 200, description: 'User profile successfully updated' })
  @ApiResponse({ status: 400, description: 'Invalid input or invalid file type/size' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(
    @CurrentUser() currentUser: AuthUser,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: AVATAR_MAX_BYTES }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|gif)$/i }),
        ],
        fileIsRequired: false,
      }),
    )
    avatarFile?: Express.Multer.File,
    @Query('private') isPrivate?: string,
  ) {
    const isPrivateAvatar = isPrivate === 'true' || isPrivate === '1';
    return await this.usersService.updateUser(
      currentUser.id,
      updateUserDto,
      avatarFile,
      isPrivateAvatar,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get profile of any user by ID, including followers/following count and follow status',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User profile with social counts' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return await this.usersService.getProfile(id, currentUser.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/follow')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Follow a user' })
  @ApiParam({ name: 'id', description: 'User UUID to follow' })
  @ApiResponse({ status: 201, description: 'Successfully followed user' })
  @ApiResponse({ status: 400, description: 'Cannot follow yourself or inactive user' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Already following user' })
  async followUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return await this.usersService.followUser(currentUser.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/follow')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unfollow a user' })
  @ApiParam({ name: 'id', description: 'User UUID to unfollow' })
  @ApiResponse({ status: 200, description: 'Successfully unfollowed user' })
  @ApiResponse({ status: 400, description: 'Not following this user' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async unfollowUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return await this.usersService.unfollowUser(currentUser.id, id);
  }
}
