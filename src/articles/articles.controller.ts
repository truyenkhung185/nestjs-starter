import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ArticlesService } from './articles.service.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { QueryArticlesDto } from './dto/query-articles.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { ARTICLE_FIELD_LIMITS } from './constants/article.constants.js';

@ApiTags('Articles')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create an article' })
  @ApiResponse({ status: 201, description: 'Article created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createArticle(
    @CurrentUser() user: AuthUser,
    @Body() createArticleDto: CreateArticleDto,
  ) {
    return await this.articlesService.createArticle(user.id, createArticleDto);
  }

  @Get()
  @ApiOperation({ summary: 'List articles with optional filtering (tag, author, favorited)' })
  @ApiResponse({ status: 200, description: 'Articles list and count' })
  async listArticles(
    @Query() query: QueryArticlesDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return await this.articlesService.listArticles(query, user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('feed')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get recent articles from authors you follow' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: `Limit items (default ${ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_LIMIT})`,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: `Offset items (default ${ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_OFFSET})`,
  })
  @ApiResponse({ status: 200, description: 'Feed articles list and count' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFeed(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return await this.articlesService.getFeed(
      user.id,
      limit ? Number(limit) : ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_LIMIT,
      offset ? Number(offset) : ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_OFFSET,
    );
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a single article by slug' })
  @ApiParam({ name: 'slug', description: 'Article slug' })
  @ApiResponse({ status: 200, description: 'Article details' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticle(
    @Param('slug') slug: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return await this.articlesService.getArticleBySlug(slug, user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':slug')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update an article (Author or Admin only)' })
  @ApiParam({ name: 'slug', description: 'Article slug' })
  @ApiResponse({ status: 200, description: 'Article updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden (Not author/admin)' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async updateArticle(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
    @Body() updateArticleDto: UpdateArticleDto,
  ) {
    return await this.articlesService.updateArticle(
      slug,
      user.id,
      user.role,
      updateArticleDto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':slug')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete an article (Author or Admin only)' })
  @ApiParam({ name: 'slug', description: 'Article slug' })
  @ApiResponse({ status: 200, description: 'Article deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden (Not author/admin)' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async deleteArticle(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.articlesService.deleteArticle(slug, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':slug/favorite')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Favorite an article' })
  @ApiParam({ name: 'slug', description: 'Article slug' })
  @ApiResponse({ status: 200, description: 'Article favorited' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async favoriteArticle(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.articlesService.favoriteArticle(slug, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':slug/favorite')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unfavorite an article' })
  @ApiParam({ name: 'slug', description: 'Article slug' })
  @ApiResponse({ status: 200, description: 'Article unfavorited' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async unfavoriteArticle(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
  ) {
    return await this.articlesService.unfavoriteArticle(slug, user.id);
  }
}
