import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../../auth/infrastructure/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { UsersService, type PublicUser } from '../../users/users.service';
import {
  AppearanceProfileDto,
  VehicleAppearanceDto,
} from './dto/vehicle-appearance.dto';
import type { AppearanceProfile } from '../domain/vehicle-appearance';
@ApiTags('garage')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@Controller('users/me/appearance')
export class AppearanceController {
  constructor(private readonly users: UsersService) {}
  @Get()
  @ApiOperation({ summary: 'Get the equipped vehicle appearance' })
  @ApiOkResponse({ type: AppearanceProfileDto })
  get(@CurrentUser() user: PublicUser): Promise<AppearanceProfile> {
    return this.users.getAppearance(user.id);
  }
  @Patch()
  @ApiOperation({ summary: 'Equip a vehicle appearance for future races' })
  @ApiOkResponse({ type: AppearanceProfileDto })
  @ApiBadRequestResponse({
    description: 'Invalid model, paint, finish, livery or race number',
  })
  save(
    @CurrentUser() user: PublicUser,
    @Body() appearance: VehicleAppearanceDto,
  ): Promise<AppearanceProfile> {
    return this.users.saveAppearance(user.id, appearance);
  }
}
