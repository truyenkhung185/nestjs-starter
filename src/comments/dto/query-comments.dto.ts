import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { COMMENT_FIELD_LIMITS } from '../constants/comment.constants.js';

export class QueryCommentsDto {
  @ApiProperty({
    required: false,
    default: COMMENT_FIELD_LIMITS.DEFAULT_PAGE_LIMIT,
    maximum: COMMENT_FIELD_LIMITS.MAX_PAGE_LIMIT,
    description: 'Limit number of comments returned',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COMMENT_FIELD_LIMITS.MAX_PAGE_LIMIT)
  limit?: number = COMMENT_FIELD_LIMITS.DEFAULT_PAGE_LIMIT;

  @ApiProperty({
    required: false,
    default: COMMENT_FIELD_LIMITS.DEFAULT_PAGE_OFFSET,
    description: 'Offset number of comments to skip',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = COMMENT_FIELD_LIMITS.DEFAULT_PAGE_OFFSET;
}
