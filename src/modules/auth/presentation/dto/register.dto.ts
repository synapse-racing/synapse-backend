import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'driver@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'driver_one' })
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username can only contain letters, numbers and underscores',
  })
  username!: string;

  @ApiProperty({ minLength: 10, maxLength: 72, writeOnly: true })
  @IsString()
  @Length(10, 72)
  password!: string;
}
