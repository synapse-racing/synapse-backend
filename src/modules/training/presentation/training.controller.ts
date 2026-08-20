import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../../auth/infrastructure/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import type { PublicUser } from '../../users/users.service';
import { TrainingService } from '../application/training.service';
import { CreateTrainingRunDto } from './dto/create-training-run.dto';
import { SaveCheckpointDto } from './dto/save-checkpoint.dto';
import { UpdateTrainingStatusDto } from './dto/update-training-status.dto';

@ApiTags('training-runs')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('training-runs')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a training run' })
  @ApiCreatedResponse({ description: 'Training run created' })
  create(@CurrentUser() user: PublicUser, @Body() input: CreateTrainingRunDto) {
    return this.trainingService.create(user.id, input);
  }

  @Get()
  @ApiOperation({ summary: 'List current user training runs' })
  @ApiOkResponse({ description: 'Training runs ordered by update date' })
  list(@CurrentUser() user: PublicUser) {
    return this.trainingService.list(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a training run' })
  @ApiNotFoundResponse({ description: 'Training run not found' })
  get(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.trainingService.get(user.id, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update training status' })
  updateStatus(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTrainingStatusDto,
  ) {
    return this.trainingService.updateStatus(user.id, id, input.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Training run deleted' })
  async delete(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.trainingService.delete(user.id, id);
  }

  @Post(':id/checkpoints')
  @ApiOperation({ summary: 'Save a generation checkpoint and metrics' })
  saveCheckpoint(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SaveCheckpointDto,
  ) {
    return this.trainingService.saveCheckpoint(user.id, id, input);
  }

  @Get(':id/checkpoints/latest')
  @ApiOperation({ summary: 'Get the latest population checkpoint' })
  latestCheckpoint(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trainingService.latestCheckpoint(user.id, id);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'List generation metrics' })
  metrics(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trainingService.metrics(user.id, id);
  }

  @Get(':id/best-genome')
  @ApiOperation({ summary: 'Get the best saved genome' })
  bestGenome(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trainingService.bestGenome(user.id, id);
  }
}
