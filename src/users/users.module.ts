import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { UserFollow } from './entities/user-follow.entity.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserFollow]),
    AttachmentsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
