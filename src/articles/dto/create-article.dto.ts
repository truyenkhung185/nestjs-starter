import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ARTICLE_FIELD_LIMITS } from '../constants/article.constants.js';

export class CreateArticleDto {
  @ApiProperty({ example: 'How to build scalable NestJS applications', description: 'Article title' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(ARTICLE_FIELD_LIMITS.TITLE_MAX_LENGTH, {
    message: `Title must not exceed ${ARTICLE_FIELD_LIMITS.TITLE_MAX_LENGTH} characters`,
  })
  title: string;

  @ApiProperty({
    example: 'A comprehensive guide to architecture and best practices with NestJS',
    description: 'Short summary/description of the article',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_FIELD_LIMITS.DESCRIPTION_MAX_LENGTH, {
    message: `Description must not exceed ${ARTICLE_FIELD_LIMITS.DESCRIPTION_MAX_LENGTH} characters`,
  })
  description?: string;

  @ApiProperty({
    example: 'Here is the full markdown content of the article...',
    description: 'Full body content of the article',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({
    example: ['nestjs', 'typescript', 'architecture'],
    description: 'Tags for the article',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagList?: string[];
}
