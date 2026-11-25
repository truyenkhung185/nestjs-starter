import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity.js';
import { Article } from '../articles/entities/article.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UserFollow } from '../users/entities/user-follow.entity.js';
import { CommentsService } from './comments.service.js';
import { CommentsController } from './comments.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Article, User, UserFollow])],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
