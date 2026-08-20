import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'driver@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MaxLength(72)
  password!: string;
}
