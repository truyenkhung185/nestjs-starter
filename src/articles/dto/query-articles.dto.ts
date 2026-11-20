import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ required: false, default: 20, description: 'Limit number of results' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({ required: false, default: 0, description: 'Offset number of results' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
