import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({
    example: 'Nguyen Van B',
    description: 'Updated full name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Full name must not exceed 255 characters' })
  fullName?: string;

  @ApiProperty({
    example: 'Software engineer passionate about NestJS and TypeScript',
    description: 'User biography',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Bio must not exceed 1000 characters' })
  bio?: string;
}
