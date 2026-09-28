import { IsIn, IsInt } from 'class-validator';

export class RaceSpeedDto {
  @IsInt()
  @IsIn([1, 2, 4])
  timeScale!: number;
}
