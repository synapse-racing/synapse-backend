import {
  OnModuleDestroy,
  OnModuleInit,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UsersService, type PublicUser } from '../../users/users.service';
import { TrainingService } from '../../training/application/training.service';
import { RoomError, RoomService } from '../application/room.service';
import type { AccessTokenPayload } from '../../auth/domain/auth.types';
import type {
  PublicRoomState,
  RaceInput,
  RaceResult,
  RaceSnapshot,
} from '../domain/multiplayer.types';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { RaceInputDto } from './dto/race-input.dto';
import { ReadyDto } from './dto/ready.dto';
import { SelectGenomeDto } from './dto/select-genome.dto';
import { parseNeatGenome, type NeatGenome } from '../domain/neat-controller';

interface MultiplayerSocketData {
  user?: PublicUser;
}

interface ClientToServerEvents {
  'room:create': (input: CreateRoomDto) => void;
  'room:join': (input: JoinRoomDto) => void;
  'room:leave': () => void;
  'player:ready': (input: ReadyDto) => void;
  'player:select-genome': (input: SelectGenomeDto) => void;
  'race:start': () => void;
  'race:input': (input: RaceInput) => void;
}

interface ServerToClientEvents {
  'connection:ready': (payload: { userId: string }) => void;
  'server:error': (payload: { code: string; message: string }) => void;
  'room:state': (state: PublicRoomState) => void;
  'room:left': () => void;
  'race:start': (payload: { startAt: number }) => void;
  'race:snapshot': (snapshot: RaceSnapshot) => void;
  'race:finish': (result: RaceResult) => void;
}

type MultiplayerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, unknown>,
  MultiplayerSocketData
>;

@WebSocketGateway({
  namespace: '/multiplayer',
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  },
})
@UsePipes(
  new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  }),
)
export class MultiplayerGateway
  implements
    OnGatewayConnection<MultiplayerSocket>,
    OnGatewayDisconnect<MultiplayerSocket>,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private timer?: ReturnType<typeof setInterval>;
  private tickCount = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly roomService: RoomService,
    private readonly usersService: UsersService,
    private readonly trainingService: TrainingService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.tick(), 50);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async handleConnection(client: MultiplayerSocket): Promise<void> {
    try {
      const auth = client.handshake.auth as Record<string, unknown>;
      const token = auth.token;
      if (typeof token !== 'string') throw new Error('Missing token');

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );
      if (payload.type !== 'access' || !payload.sub)
        throw new Error('Invalid token');

      const user = await this.usersService.findPublicById(payload.sub);
      if (!user) throw new Error('Unknown user');
      client.data.user = user;
      client.emit('connection:ready', { userId: user.id });
    } catch {
      client.emit('server:error', {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: MultiplayerSocket): void {
    const result = this.roomService.leave(client.id);
    if (result?.state) {
      this.server
        .to(this.roomName(result.code))
        .emit('room:state', result.state);
    }
  }

  @SubscribeMessage('room:create')
  createRoom(
    @ConnectedSocket() client: MultiplayerSocket,
    @MessageBody() input: CreateRoomDto,
  ): void {
    this.execute(client, (user) => {
      const state = this.roomService.create(user, client.id, input.maxPlayers);
      void client.join(this.roomName(state.code));
      this.server.to(this.roomName(state.code)).emit('room:state', state);
    });
  }

  @SubscribeMessage('room:join')
  joinRoom(
    @ConnectedSocket() client: MultiplayerSocket,
    @MessageBody() input: JoinRoomDto,
  ): void {
    this.execute(client, (user) => {
      const state = this.roomService.join(input.code, user, client.id);
      void client.join(this.roomName(state.code));
      this.server.to(this.roomName(state.code)).emit('room:state', state);
    });
  }

  @SubscribeMessage('room:leave')
  leaveRoom(@ConnectedSocket() client: MultiplayerSocket): void {
    this.execute(client, () => {
      const result = this.roomService.leave(client.id);
      if (!result) return;
      void client.leave(this.roomName(result.code));
      if (result.state) {
        this.server
          .to(this.roomName(result.code))
          .emit('room:state', result.state);
      }
      client.emit('room:left');
    });
  }

  @SubscribeMessage('player:ready')
  setReady(
    @ConnectedSocket() client: MultiplayerSocket,
    @MessageBody() input: ReadyDto,
  ): void {
    this.execute(client, () => {
      const state = this.roomService.setReady(client.id, input.ready);
      this.server.to(this.roomName(state.code)).emit('room:state', state);
    });
  }

  @SubscribeMessage('player:select-genome')
  async selectGenome(
    @ConnectedSocket() client: MultiplayerSocket,
    @MessageBody() input: SelectGenomeDto,
  ): Promise<void> {
    await this.executeAsync(client, async (user) => {
      const selected = await this.trainingService.raceGenome(
        user.id,
        input.trainingRunId,
      );
      let genome: NeatGenome;
      try {
        genome = parseNeatGenome(selected.bestGenome);
      } catch {
        throw new RoomError(
          'INVALID_GENOME',
          'The saved genome is not compatible with this race',
        );
      }
      const state = this.roomService.selectGenome(
        client.id,
        genome,
        selected.name,
      );
      this.server.to(this.roomName(state.code)).emit('room:state', state);
    });
  }

  @SubscribeMessage('race:start')
  startRace(@ConnectedSocket() client: MultiplayerSocket): void {
    this.execute(client, () => {
      const result = this.roomService.start(client.id);
      const target = this.server.to(this.roomName(result.state.code));
      target.emit('room:state', result.state);
      target.emit('race:start', { startAt: result.startAt });
    });
  }

  @SubscribeMessage('race:input')
  raceInput(
    @ConnectedSocket() client: MultiplayerSocket,
    @MessageBody() input: RaceInputDto,
  ): void {
    this.execute(client, () => {
      this.roomService.submitInput(client.id, input);
    });
  }

  private execute(
    client: MultiplayerSocket,
    operation: (user: PublicUser) => void,
  ): void {
    try {
      const user = client.data.user;
      if (!user) throw new RoomError('UNAUTHORIZED', 'Authentication required');
      operation(user);
    } catch (error) {
      const roomError =
        error instanceof RoomError
          ? error
          : new RoomError('INVALID_REQUEST', 'Request could not be completed');
      client.emit('server:error', {
        code: roomError.code,
        message: roomError.message,
      });
    }
  }

  private async executeAsync(
    client: MultiplayerSocket,
    operation: (user: PublicUser) => Promise<void>,
  ): Promise<void> {
    try {
      const user = client.data.user;
      if (!user) throw new RoomError('UNAUTHORIZED', 'Authentication required');
      await operation(user);
    } catch (error) {
      const roomError =
        error instanceof RoomError
          ? error
          : new RoomError('INVALID_REQUEST', 'Request could not be completed');
      client.emit('server:error', {
        code: roomError.code,
        message: roomError.message,
      });
    }
  }

  private tick(): void {
    this.tickCount += 1;
    for (const update of this.roomService.tick()) {
      const target = this.server.to(this.roomName(update.code));
      if (this.tickCount % 2 === 0)
        target.emit('race:snapshot', update.snapshot);
      if (update.result) {
        target.emit('room:state', update.state);
        target.emit('race:finish', update.result);
      }
    }
  }

  private roomName(code: string): string {
    return `room:${code}`;
  }
}
