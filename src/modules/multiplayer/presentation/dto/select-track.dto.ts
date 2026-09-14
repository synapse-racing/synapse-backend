import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min, ValidateNested } from 'class-validator';

class MultiplayerTrackRecipeDto {
  @IsIn(['curved-loop-v1', 'technical-loop-v2', 'grand-prix-v3'])
  version!: 'curved-loop-v1' | 'technical-loop-v2' | 'grand-prix-v3';

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  seed!: number;
}

export class SelectTrackDto {
  @ValidateNested()
  @Type(() => MultiplayerTrackRecipeDto)
  track!: MultiplayerTrackRecipeDto;
}
