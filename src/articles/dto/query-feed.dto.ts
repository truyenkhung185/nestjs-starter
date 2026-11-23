import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ARTICLE_FIELD_LIMITS } from '../constants/article.constants.js';

export class QueryFeedDto {
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
