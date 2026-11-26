import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ARTICLE_FIELD_LIMITS } from '../constants/article.constants.js';

export class UpdateArticleDto {
  @ApiPropertyOptional({
    example: 'Updated title of article',
    description: 'Updated article title',
  })
  @ValidateIf((o: UpdateArticleDto) => o.title !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Title must not be empty' })
  @MaxLength(ARTICLE_FIELD_LIMITS.TITLE_MAX_LENGTH, {
    message: `Title must not exceed ${ARTICLE_FIELD_LIMITS.TITLE_MAX_LENGTH} characters`,
  })
  title?: string;

  @ApiPropertyOptional({
    example: 'Updated summary of the article',
    description: 'Updated short description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_FIELD_LIMITS.DESCRIPTION_MAX_LENGTH, {
    message: `Description must not exceed ${ARTICLE_FIELD_LIMITS.DESCRIPTION_MAX_LENGTH} characters`,
  })
  description?: string;

  @ApiPropertyOptional({
    example: 'Updated full markdown body content...',
    description: 'Updated article body',
  })
  @ValidateIf((o: UpdateArticleDto) => o.body !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Body must not be empty' })
  body?: string;

  @ApiPropertyOptional({
    example: ['nestjs', 'typeorm'],
    description: 'Updated tag list',
    type: [String],
  })
  @ValidateIf((o: UpdateArticleDto) => o.tagList !== undefined)
  @IsArray()
  @IsString({ each: true })
  tagList?: string[];
}
