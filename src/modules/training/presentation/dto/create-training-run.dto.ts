import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsObject, IsString, Length, Max, Min } from 'class-validator';

export class CreateTrainingRunDto {
  @ApiProperty({ example: 'Circuito rectangular - intento 1' })
  @IsString()
  @Length(3, 80)
  name!: string;

  @ApiProperty({ example: 42170 })
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  seed!: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  config!: Record<string, unknown>;
}
