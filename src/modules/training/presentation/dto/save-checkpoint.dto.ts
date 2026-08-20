import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsObject, Min } from 'class-validator';

export class SaveCheckpointDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  generation!: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  snapshot!: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  bestGenome!: Record<string, unknown>;

  @ApiProperty({ example: 1250.5 })
  @IsNumber()
  @Min(0)
  bestFitness!: number;

  @ApiProperty({ example: 420.2 })
  @IsNumber()
  @Min(0)
  averageFitness!: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  speciesCount!: number;

  @ApiProperty({ example: 18500 })
  @IsInt()
  @Min(0)
  durationMs!: number;
}
