import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class RaceInputDto {
  @IsInt()
  @Min(0)
  sequence!: number;

  @IsNumber()
  @Min(-1)
  @Max(1)
  steering!: number;

  @IsNumber()
  @Min(-1)
  @Max(1)
  throttle!: number;
}
