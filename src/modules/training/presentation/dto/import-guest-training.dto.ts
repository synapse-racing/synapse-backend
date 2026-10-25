import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateTrainingRunDto } from './create-training-run.dto';

export class GuestGenerationMetricDto {
  @IsInt() @Min(0) generation!: number;
  @IsNumber() @Min(0) bestFitness!: number;
  @IsNumber() @Min(0) averageFitness!: number;
  @IsInt() @Min(1) speciesCount!: number;
  @IsInt() @Min(0) durationMs!: number;
}

export class ImportGuestTrainingDto extends CreateTrainingRunDto {
  @ApiProperty({
    description:
      'Stable local run UUID. Retries import it only once per account.',
  })
  @IsUUID()
  sourceId!: string;
  @ApiProperty() @IsInt() @Min(0) generation!: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  snapshot!: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  bestGenome?: Record<string, unknown>;
  @ApiProperty() @IsNumber() @Min(0) bestFitness!: number;
  @ApiProperty({ type: [GuestGenerationMetricDto] })
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => GuestGenerationMetricDto)
  metrics!: GuestGenerationMetricDto[];
}
