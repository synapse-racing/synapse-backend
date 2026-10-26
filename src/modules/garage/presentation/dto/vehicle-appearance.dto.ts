import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Matches, Max, Min } from 'class-validator';
import type { VehicleAppearance } from '../../domain/vehicle-appearance';
export class VehicleAppearanceDto implements VehicleAppearance {
  @ApiProperty({ enum: ['formula', 'gt', 'prototype'] })
  @IsIn(['formula', 'gt', 'prototype'])
  modelId!: VehicleAppearance['modelId'];
  @ApiProperty({ example: '#ff692f', pattern: '^#[0-9a-fA-F]{6}$' })
  @Matches(/^#[0-9a-f]{6}$/i)
  primaryColor!: string;
  @ApiProperty({ example: '#f4ead3', pattern: '^#[0-9a-fA-F]{6}$' })
  @Matches(/^#[0-9a-f]{6}$/i)
  secondaryColor!: string;
  @ApiProperty({ example: '#d7dce0', pattern: '^#[0-9a-fA-F]{6}$' })
  @Matches(/^#[0-9a-f]{6}$/i)
  rimColor!: string;
  @ApiProperty({ enum: ['matte', 'satin', 'metallic'] })
  @IsIn(['matte', 'satin', 'metallic'])
  finish!: VehicleAppearance['finish'];
  @ApiProperty({ enum: ['solid', 'stripe', 'split'] })
  @IsIn(['solid', 'stripe', 'split'])
  livery!: VehicleAppearance['livery'];
  @ApiProperty({ minimum: 1, maximum: 99, example: 7 })
  @IsInt()
  @Min(1)
  @Max(99)
  number!: number;
}
export class AppearanceProfileDto {
  @ApiProperty({ type: VehicleAppearanceDto })
  appearance!: VehicleAppearanceDto;
  @ApiProperty()
  customized!: boolean;
}
