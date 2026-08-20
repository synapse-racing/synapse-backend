import { TrainingStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateTrainingStatusDto {
  @ApiProperty({ enum: TrainingStatus })
  @IsEnum(TrainingStatus)
  status!: TrainingStatus;
}
