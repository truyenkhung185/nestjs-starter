import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { Article } from './entities/article.entity.js';
import { ArticleFavorite } from './entities/article-favorite.entity.js';
import { UserFollow } from '../users/entities/user-follow.entity.js';
import { User, UserRole } from '../users/entities/user.entity.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { QueryArticlesDto } from './dto/query-articles.dto.js';
import { ARTICLE_FIELD_LIMITS } from './constants/article.constants.js';

export interface FormattedArticle {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body: string;
  tagList: string[];
  favoritesCount: number;
  favorited: boolean;
  author: {
    id: string;
    email: string;
    fullName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    following: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
    @InjectRepository(ArticleFavorite)
    private readonly favoriteRepository: Repository<ArticleFavorite>,
    @InjectRepository(UserFollow)
    private readonly userFollowRepository: Repository<UserFollow>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly i18n: I18nService,
  ) {}

  private slugify(title: string): string {
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const uniqueSuffix = crypto.randomBytes(4).toString('hex');
    return `${baseSlug}-${uniqueSuffix}`;
  }

  async createArticle(
    authorId: string,
    createArticleDto: CreateArticleDto,
  ): Promise<FormattedArticle> {
    const slug = this.slugify(createArticleDto.title);

    const article = this.articleRepository.create({
      title: createArticleDto.title,
      description: createArticleDto.description || null,
      body: createArticleDto.body,
      tagList: createArticleDto.tagList || [],
      slug,
      authorId,
      favoritesCount: 0,
    });

    const savedArticle = await this.articleRepository.save(article);
    const author = await this.userRepository.findOne({ where: { id: authorId } });

    return this.buildArticleResponse(savedArticle, author!, false, false);
  }

  async getArticleBySlug(
    slug: string,
    currentUserId?: string,
  ): Promise<FormattedArticle> {
    const article = await this.articleRepository.findOne({
      where: { slug },
      relations: ['author'],
    });

    if (!article) {
      throw new NotFoundException(
        this.i18n.t('articles.ARTICLE_NOT_FOUND', { args: { slug } }) ||
          `Article with slug "${slug}" not found`,
      );
    }

    let favorited = false;
    let following = false;

    if (currentUserId) {
      const [fav, follow] = await Promise.all([
        this.favoriteRepository.findOne({
          where: { userId: currentUserId, articleId: article.id },
        }),
        this.userFollowRepository.findOne({
          where: { followerId: currentUserId, followingId: article.authorId },
        }),
      ]);
      favorited = !!fav;
      following = !!follow;
    }

    return this.buildArticleResponse(article, article.author, favorited, following);
  }

  async updateArticle(
    slug: string,
    userId: string,
    userRole: string,
    updateArticleDto: UpdateArticleDto,
  ): Promise<FormattedArticle> {
    const article = await this.articleRepository.findOne({
      where: { slug },
      relations: ['author'],
    });

    if (!article) {
      throw new NotFoundException(
        this.i18n.t('articles.ARTICLE_NOT_FOUND', { args: { slug } }) ||
          `Article with slug "${slug}" not found`,
      );
    }

    if (article.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException(
        this.i18n.t('articles.FORBIDDEN_UPDATE') ||
          'You are not allowed to update this article',
      );
    }

    if (updateArticleDto.title && updateArticleDto.title !== article.title) {
      article.title = updateArticleDto.title;
      article.slug = this.slugify(updateArticleDto.title);
    }
    if (updateArticleDto.description !== undefined) {
      article.description = updateArticleDto.description;
    }
    if (updateArticleDto.body !== undefined) {
      article.body = updateArticleDto.body;
    }
    if (updateArticleDto.tagList !== undefined) {
      article.tagList = updateArticleDto.tagList;
    }

    const saved = await this.articleRepository.save(article);

    const [fav, follow] = await Promise.all([
      this.favoriteRepository.findOne({
        where: { userId, articleId: saved.id },
      }),
      this.userFollowRepository.findOne({
        where: { followerId: userId, followingId: saved.authorId },
      }),
    ]);

    return this.buildArticleResponse(saved, saved.author, !!fav, !!follow);
  }

  async deleteArticle(
    slug: string,
    userId: string,
    userRole: string,
  ): Promise<{ message: string }> {
    const article = await this.articleRepository.findOne({ where: { slug } });

    if (!article) {
      throw new NotFoundException(
        this.i18n.t('articles.ARTICLE_NOT_FOUND', { args: { slug } }) ||
          `Article with slug "${slug}" not found`,
      );
    }

    if (article.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException(
        this.i18n.t('articles.FORBIDDEN_DELETE') ||
          'You are not allowed to delete this article',
      );
    }

    await this.articleRepository.remove(article);
    return {
      message:
        this.i18n.t('articles.ARTICLE_DELETED_SUCCESS') ||
        'Article successfully deleted',
    };
  }

  async listArticles(
    query: QueryArticlesDto,
    currentUserId?: string,
  ): Promise<{ articles: FormattedArticle[]; articlesCount: number }> {
    const qb = this.articleRepository
      .createQueryBuilder('article')
      .leftJoinAndSelect('article.author', 'author')
      .orderBy('article.createdAt', 'DESC');

    if (query.tag) {
      qb.andWhere(':tag = ANY(article.tagList)', { tag: query.tag });
    }

    if (query.author) {
      qb.andWhere('author.email = :authorEmail', { authorEmail: query.author });
    }

    if (query.favorited) {
      const favoritingUser = await this.userRepository.findOne({
        where: [{ email: query.favorited }, { id: query.favorited }],
      });
      if (favoritingUser) {
        qb.innerJoin(
          'article_favorites',
          'favFilter',
          'favFilter.article_id = article.id AND favFilter.user_id = :favUserId',
          { favUserId: favoritingUser.id },
        );
      } else {
        return { articles: [], articlesCount: 0 };
      }
    }

    const limit = query.limit ?? ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_LIMIT;
    const offset = query.offset ?? ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_OFFSET;

    qb.skip(offset).take(limit);

    const [articles, articlesCount] = await qb.getManyAndCount();
    const formatted = await this.enrichArticles(articles, currentUserId);

    return { articles: formatted, articlesCount };
  }

  async getFeed(
    userId: string,
    limit: number = ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_LIMIT,
    offset: number = ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_OFFSET,
  ): Promise<{ articles: FormattedArticle[]; articlesCount: number }> {
    // Get list of followed authors
    const follows = await this.userFollowRepository.find({
      where: { followerId: userId },
    });

    if (follows.length === 0) {
      return { articles: [], articlesCount: 0 };
    }

    const followingIds = follows.map((f) => f.followingId);

    const [articles, articlesCount] = await this.articleRepository.findAndCount({
      where: { authorId: In(followingIds) },
      relations: ['author'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const formatted = await this.enrichArticles(articles, userId);
    return { articles: formatted, articlesCount };
  }

  async favoriteArticle(
    slug: string,
    userId: string,
  ): Promise<FormattedArticle> {
    const article = await this.articleRepository.findOne({
      where: { slug },
      relations: ['author'],
    });

    if (!article) {
      throw new NotFoundException(
        this.i18n.t('articles.ARTICLE_NOT_FOUND', { args: { slug } }) ||
          `Article with slug "${slug}" not found`,
      );
    }

    const existingFavorite = await this.favoriteRepository.findOne({
      where: { userId, articleId: article.id },
    });

    if (!existingFavorite) {
      try {
        const fav = this.favoriteRepository.create({
          userId,
          articleId: article.id,
        });
        await this.favoriteRepository.save(fav);
        article.favoritesCount += 1;
        await this.articleRepository.save(article);
      } catch (err: any) {
        // Handle race condition duplicate key gracefully
        if (!err?.code?.includes('23505') && !err?.message?.includes('duplicate key')) {
          throw err;
        }
      }
    }

    const follow = await this.userFollowRepository.findOne({
      where: { followerId: userId, followingId: article.authorId },
    });

    return this.buildArticleResponse(article, article.author, true, !!follow);
  }

  async unfavoriteArticle(
    slug: string,
    userId: string,
  ): Promise<FormattedArticle> {
    const article = await this.articleRepository.findOne({
      where: { slug },
      relations: ['author'],
    });

    if (!article) {
      throw new NotFoundException(
        this.i18n.t('articles.ARTICLE_NOT_FOUND', { args: { slug } }) ||
          `Article with slug "${slug}" not found`,
      );
    }

    const existingFavorite = await this.favoriteRepository.findOne({
      where: { userId, articleId: article.id },
    });

    if (existingFavorite) {
      await this.favoriteRepository.remove(existingFavorite);
      article.favoritesCount = Math.max(0, article.favoritesCount - 1);
      await this.articleRepository.save(article);
    }

    const follow = await this.userFollowRepository.findOne({
      where: { followerId: userId, followingId: article.authorId },
    });

    return this.buildArticleResponse(article, article.author, false, !!follow);
  }

  private async enrichArticles(
    articles: Article[],
    currentUserId?: string,
  ): Promise<FormattedArticle[]> {
    if (articles.length === 0) return [];

    let favoritedArticleIds = new Set<string>();
    let followedAuthorIds = new Set<string>();

    if (currentUserId) {
      const articleIds = articles.map((a) => a.id);
      const authorIds = Array.from(new Set(articles.map((a) => a.authorId)));

      const [userFavorites, userFollows] = await Promise.all([
        this.favoriteRepository.find({
          where: { userId: currentUserId, articleId: In(articleIds) },
        }),
        this.userFollowRepository.find({
          where: { followerId: currentUserId, followingId: In(authorIds) },
        }),
      ]);

      favoritedArticleIds = new Set(userFavorites.map((f) => f.articleId));
      followedAuthorIds = new Set(userFollows.map((f) => f.followingId));
    }

    return articles.map((article) => {
      const isFav = favoritedArticleIds.has(article.id);
      const isFollowing = followedAuthorIds.has(article.authorId);
      return this.buildArticleResponse(
        article,
        article.author,
        isFav,
        isFollowing,
      );
    });
  }

  private buildArticleResponse(
    article: Article,
    author: User,
    favorited: boolean,
    following: boolean,
  ): FormattedArticle {
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      description: article.description,
      body: article.body,
      tagList: article.tagList || [],
      favoritesCount: article.favoritesCount,
      favorited,
      author: {
        id: author.id,
        email: author.email,
        fullName: author.fullName,
        bio: author.bio,
        avatarUrl: author.avatarUrl,
        following,
      },
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    };
  }
}
