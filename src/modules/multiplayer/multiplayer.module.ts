import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrainingModule } from '../training/training.module';
import { RoomService } from './application/room.service';
import { MultiplayerGateway } from './presentation/multiplayer.gateway';

@Module({
  imports: [AuthModule, TrainingModule],
  providers: [RoomService, MultiplayerGateway],
})
export class MultiplayerModule {}
