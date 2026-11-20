import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { USER_FIELD_LIMITS } from '../constants/user.constants.js';

export class UpdateUserDto {
  @ApiProperty({
    example: 'Nguyen Van B',
    description: 'Updated full name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(USER_FIELD_LIMITS.FULL_NAME_MAX_LENGTH, {
    message: `Full name must not exceed ${USER_FIELD_LIMITS.FULL_NAME_MAX_LENGTH} characters`,
  })
  fullName?: string;

  @ApiProperty({
    example: 'Software engineer passionate about NestJS and TypeScript',
    description: 'User biography',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(USER_FIELD_LIMITS.BIO_MAX_LENGTH, {
    message: `Bio must not exceed ${USER_FIELD_LIMITS.BIO_MAX_LENGTH} characters`,
  })
  bio?: string;
}
