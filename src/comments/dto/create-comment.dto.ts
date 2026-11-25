import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { COMMENT_FIELD_LIMITS } from '../constants/comment.constants.js';

export class CreateCommentDto {
  @ApiProperty({
    example: 'Great article! Very clear explanation of NestJS architecture.',
    description: 'Comment body content',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Comment body must not be empty' })
  @MaxLength(COMMENT_FIELD_LIMITS.BODY_MAX_LENGTH, {
    message: `Comment body must not exceed ${COMMENT_FIELD_LIMITS.BODY_MAX_LENGTH} characters`,
  })
  body: string;
}
