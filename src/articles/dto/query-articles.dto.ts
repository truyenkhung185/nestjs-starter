import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ARTICLE_FIELD_LIMITS } from '../constants/article.constants.js';

export class QueryArticlesDto {
  @ApiProperty({ required: false, description: 'Filter by tag' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiProperty({ required: false, description: 'Filter by author email' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiProperty({ required: false, description: 'Filter by user who favorited the article (email or ID)' })
  @IsOptional()
  @IsString()
  favorited?: string;

  @ApiProperty({
    required: false,
    default: ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_LIMIT,
    description: 'Limit number of results',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_LIMIT;

  @ApiProperty({
    required: false,
    default: ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_OFFSET,
    description: 'Offset number of results',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = ARTICLE_FIELD_LIMITS.DEFAULT_PAGE_OFFSET;
}
