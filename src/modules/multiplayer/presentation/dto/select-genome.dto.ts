import { IsUUID } from 'class-validator';

export class SelectGenomeDto {
  @IsUUID()
  trainingRunId!: string;
}
