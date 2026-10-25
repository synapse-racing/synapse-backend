import { IsInt, IsUUID, Min } from 'class-validator';

export class EliminateCarDto {
  @IsUUID()
  userId!: string;

  @IsInt()
  @Min(0)
  startAt!: number;
}
