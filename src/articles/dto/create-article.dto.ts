import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateArticleDto {
  @ApiProperty({ example: 'How to build scalable NestJS applications', description: 'Article title' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    example: 'A comprehensive guide to architecture and best practices with NestJS',
    description: 'Short summary/description of the article',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 'Here is the full markdown content of the article...',
    description: 'Full body content of the article',
  })
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
