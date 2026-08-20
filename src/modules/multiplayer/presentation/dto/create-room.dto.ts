import { IsInt, Max, Min } from 'class-validator';

export class CreateRoomDto {
  @IsInt()
  @Min(2)
  @Max(4)
  maxPlayers!: number;
}
