import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ARTICLE_FIELD_LIMITS } from '../constants/article.constants.js';

export class UpdateArticleDto {
  @ApiProperty({
    example: 'Updated title of article',
    description: 'Updated article title',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_FIELD_LIMITS.TITLE_MAX_LENGTH, {
    message: `Title must not exceed ${ARTICLE_FIELD_LIMITS.TITLE_MAX_LENGTH} characters`,
  })
  title?: string;

  @ApiProperty({
    example: 'Updated summary of the article',
    description: 'Updated short description',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_FIELD_LIMITS.DESCRIPTION_MAX_LENGTH, {
    message: `Description must not exceed ${ARTICLE_FIELD_LIMITS.DESCRIPTION_MAX_LENGTH} characters`,
  })
  description?: string;

  @ApiProperty({
    example: 'Updated full markdown body content...',
    description: 'Updated article body',
    required: false,
  })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiProperty({
    example: ['nestjs', 'typeorm'],
    description: 'Updated tag list',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagList?: string[];
}
