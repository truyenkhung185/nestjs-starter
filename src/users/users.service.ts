import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { I18nService } from 'nestjs-i18n';
import { User } from './entities/user.entity.js';
import { UserFollow } from './entities/user-follow.entity.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { AttachmentAccess } from '../attachments/entities/attachment.entity.js';
import { ATTACHABLE_TYPES } from './constants/user.constants.js';

export interface UserProfileResponse {
  id: string;
  email: string;
  fullName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  followersCount: number;
  followingCount: number;
  isFollowing?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserFollow)
    private readonly userFollowRepository: Repository<UserFollow>,
    private readonly attachmentsService: AttachmentsService,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return await this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(
        this.i18n.t('users.USER_NOT_FOUND', { args: { id } }) ||
          `User with ID ${id} not found`,
      );
    }
    return user;
  }

  async findByIdOrNull(id: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { id } });
  }

  async updateHashedRefreshToken(
    userId: string,
    hashedRefreshToken: string | null,
  ): Promise<void> {
    await this.userRepository.update(userId, { hashedRefreshToken });
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
    avatarFile?: Express.Multer.File,
    isPrivateAvatar: boolean = false,
  ): Promise<User> {
    const user = await this.findById(userId);

    if (updateUserDto.fullName !== undefined) {
      user.fullName = updateUserDto.fullName;
    }
    if (updateUserDto.bio !== undefined) {
      user.bio = updateUserDto.bio;
    }

    // Process avatar file if provided
    if (avatarFile) {
      // 1. Get old attachments before saving new one
      const oldAttachments = await this.attachmentsService.findByAttachable(
        ATTACHABLE_TYPES.USER_AVATAR,
        user.id,
      );

      // 2. Save new attachment
      const accessType = isPrivateAvatar
        ? AttachmentAccess.PRIVATE
        : AttachmentAccess.PUBLIC;

      const newAttachment = await this.attachmentsService.saveAttachment({
        file: avatarFile,
        attachableType: ATTACHABLE_TYPES.USER_AVATAR,
        attachableId: user.id,
        uploaderId: user.id,
        accessType,
      });

      const previousAvatarUrl = user.avatarUrl;
      user.avatarUrl = newAttachment.url;

      // 3. Save user with new avatar URL; rollback new attachment if user save fails
      let updatedUser: User;
      try {
        updatedUser = await this.userRepository.save(user);
      } catch (saveUserErr) {
        // Rollback newly created attachment so no orphaned file/record is left
        await this.attachmentsService
          .deleteAttachments([newAttachment])
          .catch((delErr) => {
            this.logger.warn(`Failed to cleanup new attachment after user save failure: ${delErr.message}`);
          });
        // Restore user object state
        user.avatarUrl = previousAvatarUrl;
        throw saveUserErr;
      }

      // 4. Safe post-cleanup: delete old physical files and records ONLY after success
      if (oldAttachments.length > 0) {
        await this.attachmentsService
          .deleteAttachments(oldAttachments)
          .catch((err) => {
            this.logger.warn(`Failed to clean up old avatar files: ${err.message}`);
          });
      }

      return updatedUser;
    }

    return await this.userRepository.save(user);
  }

  async getProfile(
    targetUserId: string,
    currentUserId?: string,
  ): Promise<UserProfileResponse> {
    const user = await this.findById(targetUserId);

    const [followersCount, followingCount] = await Promise.all([
      this.userFollowRepository.count({ where: { followingId: user.id } }),
      this.userFollowRepository.count({ where: { followerId: user.id } }),
    ]);

    let isFollowing = false;
    if (currentUserId && currentUserId !== user.id) {
      const followRecord = await this.userFollowRepository.findOne({
        where: { followerId: currentUserId, followingId: user.id },
      });
      isFollowing = !!followRecord;
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isActive: user.isActive,
      followersCount,
      followingCount,
      isFollowing,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async followUser(
    followerId: string,
    followingId: string,
  ): Promise<{ message: string }> {
    if (followerId === followingId) {
      throw new BadRequestException(
        this.i18n.t('users.CANNOT_FOLLOW_SELF') || 'You cannot follow yourself',
      );
    }

    const targetUser = await this.findById(followingId);
    if (!targetUser.isActive) {
      throw new BadRequestException(
        this.i18n.t('users.CANNOT_FOLLOW_INACTIVE') ||
          'Cannot follow an inactive user',
      );
    }

    const existingFollow = await this.userFollowRepository.findOne({
      where: { followerId, followingId },
    });
    if (existingFollow) {
      throw new ConflictException(
        this.i18n.t('users.ALREADY_FOLLOWING') ||
          'You are already following this user',
      );
    }

    try {
      const follow = this.userFollowRepository.create({
        followerId,
        followingId,
      });
      await this.userFollowRepository.save(follow);
    } catch (err: any) {
      // Postgres unique constraint violation
      if (
        err?.code === '23505' ||
        err?.message?.includes('duplicate key') ||
        err?.message?.includes('unique')
      ) {
        throw new ConflictException(
          this.i18n.t('users.ALREADY_FOLLOWING') ||
            'You are already following this user',
        );
      }
      throw err;
    }

    const targetName = targetUser.fullName || targetUser.email;
    return {
      message:
        this.i18n.t('users.FOLLOW_SUCCESS', { args: { name: targetName } }) ||
        `Successfully followed ${targetName}`,
    };
  }

  async unfollowUser(
    followerId: string,
    followingId: string,
  ): Promise<{ message: string }> {
    if (followerId === followingId) {
      throw new BadRequestException(
        this.i18n.t('users.CANNOT_UNFOLLOW_SELF') ||
          'You cannot unfollow yourself',
      );
    }

    const targetUser = await this.findById(followingId);

    const follow = await this.userFollowRepository.findOne({
      where: { followerId, followingId },
    });
    if (!follow) {
      throw new BadRequestException(
        this.i18n.t('users.NOT_FOLLOWING') || 'You are not following this user',
      );
    }

    await this.userFollowRepository.remove(follow);

    const targetName = targetUser.fullName || targetUser.email;
    return {
      message:
        this.i18n.t('users.UNFOLLOW_SUCCESS', { args: { name: targetName } }) ||
        `Successfully unfollowed ${targetName}`,
    };
  }
}
