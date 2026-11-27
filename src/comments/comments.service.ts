import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { I18nService } from 'nestjs-i18n';
import { Comment } from './entities/comment.entity.js';
import { Article } from '../articles/entities/article.entity.js';
import { User, UserRole } from '../users/entities/user.entity.js';
import { UserFollow } from '../users/entities/user-follow.entity.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { QueryCommentsDto } from './dto/query-comments.dto.js';
import { COMMENT_FIELD_LIMITS } from './constants/comment.constants.js';

export interface FormattedComment {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    fullName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    following: boolean;
  };
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserFollow)
    private readonly userFollowRepository: Repository<UserFollow>,
    private readonly i18n: I18nService,
  ) {}

  private async findArticleBySlugOrFail(slug: string): Promise<Article> {
    const article = await this.articleRepository.findOne({ where: { slug } });
    if (!article) {
      throw new NotFoundException(
        this.i18n.t('comments.ARTICLE_NOT_FOUND', { args: { slug } }),
      );
    }
    return article;
  }

  async addComment(
    slug: string,
    authorId: string,
    createCommentDto: CreateCommentDto,
  ): Promise<FormattedComment> {
    const article = await this.findArticleBySlugOrFail(slug);

    const author = await this.userRepository.findOne({ where: { id: authorId } });
    if (!author) {
      throw new NotFoundException(this.i18n.t('comments.AUTHOR_NOT_FOUND'));
    }

    const comment = this.commentRepository.create({
      body: createCommentDto.body,
      articleId: article.id,
      authorId: author.id,
    });

    let savedComment: Comment;
    try {
      savedComment = await this.commentRepository.save(comment);
    } catch (err: any) {
      // Postgres foreign key violation (23503) if article/author deleted concurrently
      if (err?.code === '23503') {
        throw new NotFoundException(
          this.i18n.t('comments.ARTICLE_NOT_FOUND', { args: { slug } }),
        );
      }
      throw err;
    }

    return this.buildCommentResponse(savedComment, author, false);
  }

  async getComments(
    slug: string,
    query: QueryCommentsDto = {},
    currentUserId?: string,
  ): Promise<{ comments: FormattedComment[]; commentsCount: number }> {
    const article = await this.findArticleBySlugOrFail(slug);

    const limit = query.limit ?? COMMENT_FIELD_LIMITS.DEFAULT_PAGE_LIMIT;
    const offset = query.offset ?? COMMENT_FIELD_LIMITS.DEFAULT_PAGE_OFFSET;

    const [comments, commentsCount] = await this.commentRepository.findAndCount({
      where: { articleId: article.id },
      relations: { author: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: offset,
      take: limit,
    });

    if (comments.length === 0) {
      return { comments: [], commentsCount };
    }

    let followedAuthorIds = new Set<string>();
    if (currentUserId) {
      const authorIds = Array.from(new Set(comments.map((c) => c.authorId)));
      const follows = await this.userFollowRepository.find({
        where: { followerId: currentUserId, followingId: In(authorIds) },
      });
      followedAuthorIds = new Set(follows.map((f) => f.followingId));
    }

    const formatted = comments.map((comment) =>
      this.buildCommentResponse(
        comment,
        comment.author,
        followedAuthorIds.has(comment.authorId),
      ),
    );

    return { comments: formatted, commentsCount };
  }

  async deleteComment(
    slug: string,
    commentId: string,
    userId: string,
    userRole: string,
  ): Promise<{ message: string }> {
    const article = await this.findArticleBySlugOrFail(slug);

    const comment = await this.commentRepository.findOne({
      where: { id: commentId, articleId: article.id },
    });

    if (!comment) {
      throw new NotFoundException(
        this.i18n.t('comments.COMMENT_NOT_FOUND', { args: { id: commentId } }),
      );
    }

    if (comment.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException(this.i18n.t('comments.FORBIDDEN_DELETE'));
    }

    await this.commentRepository.remove(comment);

    return {
      message: this.i18n.t('comments.COMMENT_DELETED_SUCCESS'),
    };
  }

  private buildCommentResponse(
    comment: Comment,
    author: User,
    following: boolean,
  ): FormattedComment {
    return {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: {
        id: author.id,
        fullName: author.fullName,
        bio: author.bio,
        avatarUrl: author.avatarUrl,
        following,
      },
    };
  }
}
