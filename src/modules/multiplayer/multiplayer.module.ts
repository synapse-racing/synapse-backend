import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomService } from './application/room.service';
import { MultiplayerGateway } from './presentation/multiplayer.gateway';

@Module({
  imports: [AuthModule],
  providers: [RoomService, MultiplayerGateway],
})
export class MultiplayerModule {}
