import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { UsersService } from '../../users/users.service';
import { TrainingService } from '../../training/application/training.service';
import { RoomService } from '../application/room.service';
import { MultiplayerGateway } from './multiplayer.gateway';

describe('multiplayer broadcast cadence', () => {
  afterEach(() => jest.useRealTimers());

  it('sends 20 snapshots per second and sends the terminal pose before the result', () => {
    jest.useFakeTimers();
    const snapshot = { serverTime: 1000 };
    const result = { finishedAt: 1000 };
    const update = {
      code: 'ABCDEF',
      snapshot,
      state: {},
      result: null as unknown,
    };
    const tick = jest.fn(() => [update]);
    const emit = jest.fn();
    const gateway = new MultiplayerGateway(
      {} as ConfigService,
      {} as JwtService,
      { tick } as unknown as RoomService,
      {} as UsersService,
      {} as TrainingService,
    );
    gateway.server = { to: jest.fn(() => ({ emit })) } as unknown as Server;
    gateway.onModuleInit();
    try {
      jest.advanceTimersByTime(1000);
      expect(emit).toHaveBeenCalledTimes(20);
      emit.mockClear();
      update.result = result;
      jest.advanceTimersByTime(50);
      expect(emit.mock.calls).toEqual([
        ['race:snapshot', snapshot],
        ['room:state', {}],
        ['race:finish', result],
      ]);
    } finally {
      gateway.onModuleDestroy();
    }
  });
});
