import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'User password (between 6 and 72 characters)',
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  password: string;

  @ApiProperty({
    example: 'Nguyen Van A',
    description: 'Full name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Full name must not exceed 255 characters' })
  fullName?: string;
}
