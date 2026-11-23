import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from './entities/article.entity.js';
import { ArticleFavorite } from './entities/article-favorite.entity.js';
import { UserFollow } from '../users/entities/user-follow.entity.js';
import { User } from '../users/entities/user.entity.js';
import { ArticlesService } from './articles.service.js';
import { ArticlesController } from './articles.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article, ArticleFavorite, UserFollow, User]),
  ],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
