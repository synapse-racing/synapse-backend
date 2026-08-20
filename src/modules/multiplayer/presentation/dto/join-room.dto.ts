import { IsString, Matches } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9]{6}$/)
  code!: string;
}
