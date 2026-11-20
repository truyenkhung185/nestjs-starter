import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { UserFollow } from './entities/user-follow.entity.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { AttachmentAccess } from '../attachments/entities/attachment.entity.js';

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
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserFollow)
    private readonly userFollowRepository: Repository<UserFollow>,
    private readonly attachmentsService: AttachmentsService,
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
      throw new NotFoundException(`User with ID ${id} not found`);
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
      // Validate file type (image only)
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimes.includes(avatarFile.mimetype)) {
        throw new BadRequestException(
          'Invalid avatar file type. Allowed formats: JPEG, PNG, WEBP, GIF',
        );
      }

      // Max size: 5MB
      const maxSizeBytes = 5 * 1024 * 1024;
      if (avatarFile.size > maxSizeBytes) {
        throw new BadRequestException('Avatar file size must not exceed 5MB');
      }

      // Delete previous avatar attachment files for this user
      await this.attachmentsService.deleteByAttachable('UserAvatar', user.id);

      // Save attachment with polymorphic relationship
      const accessType = isPrivateAvatar
        ? AttachmentAccess.PRIVATE
        : AttachmentAccess.PUBLIC;

      const attachment = await this.attachmentsService.saveAttachment({
        file: avatarFile,
        attachableType: 'UserAvatar',
        attachableId: user.id,
        uploaderId: user.id,
        accessType,
      });

      user.avatarUrl = attachment.url;
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
      throw new BadRequestException('You cannot follow yourself');
    }

    const targetUser = await this.findById(followingId);
    if (!targetUser.isActive) {
      throw new BadRequestException('Cannot follow an inactive user');
    }

    const existingFollow = await this.userFollowRepository.findOne({
      where: { followerId, followingId },
    });
    if (existingFollow) {
      throw new ConflictException('You are already following this user');
    }

    const follow = this.userFollowRepository.create({
      followerId,
      followingId,
    });
    await this.userFollowRepository.save(follow);

    return { message: `Successfully followed ${targetUser.fullName || targetUser.email}` };
  }

  async unfollowUser(
    followerId: string,
    followingId: string,
  ): Promise<{ message: string }> {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot unfollow yourself');
    }

    const targetUser = await this.findById(followingId);

    const follow = await this.userFollowRepository.findOne({
      where: { followerId, followingId },
    });
    if (!follow) {
      throw new BadRequestException('You are not following this user');
    }

    await this.userFollowRepository.remove(follow);

    return { message: `Successfully unfollowed ${targetUser.fullName || targetUser.email}` };
  }
}
