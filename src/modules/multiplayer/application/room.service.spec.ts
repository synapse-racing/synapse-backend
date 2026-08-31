import { RoomError, RoomService } from './room.service';
import type { NeatGenome } from '../domain/neat-controller';

const multiplayerTrack = { version: 'curved-loop-v1' as const, seed: 99 };

const genome: NeatGenome = {
  id: 'pilot',
  nodes: [
    ...Array.from({ length: 6 }, (_, id) => ({
      id,
      type: 'input' as const,
      layer: 0,
    })),
    { id: 6, type: 'bias', layer: 0 },
    { id: 7, type: 'output', layer: 1 },
    { id: 8, type: 'output', layer: 1 },
  ],
  connections: [],
};

function expectRoomError(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error('Expected RoomError');
  } catch (error) {
    expect(error).toBeInstanceOf(RoomError);
    if (error instanceof RoomError) expect(error.code).toBe(code);
  }
}

describe('RoomService', () => {
  it('creates a lobby, requires ready players and starts by host', () => {
    const service = new RoomService();
    const host = { id: 'host', username: 'Host' };
    const guest = { id: 'guest', username: 'Guest' };
    const created = service.create(host, 'socket-host', 2);
    const joined = service.join(
      created.code.toLowerCase(),
      guest,
      'socket-guest',
    );

    expect(joined.players).toHaveLength(2);
    expect(() => service.start('socket-host', 1000)).toThrow(RoomError);

    service.selectTrack('socket-host', multiplayerTrack);
    service.selectGenome('socket-host', genome, 'Host AI');
    service.selectGenome('socket-guest', genome, 'Guest AI');
    service.setReady('socket-host', true);
    service.setReady('socket-guest', true);
    expectRoomError(() => service.start('socket-guest', 1000), 'HOST_REQUIRED');

    const started = service.start('socket-host', 1000);
    expect(started.state.status).toBe('COUNTDOWN');
    expect(started.startAt).toBe(4000);
    expect(started.state.track).toEqual(multiplayerTrack);
  });

  it('lets the host choose a track independently from selected genomes', () => {
    const service = new RoomService();
    const created = service.create(
      { id: 'host', username: 'Host' },
      'socket-host',
      2,
    );
    service.join(
      created.code,
      { id: 'guest', username: 'Guest' },
      'socket-guest',
    );
    service.selectGenome('socket-host', genome, 'Host AI');
    service.selectGenome('socket-guest', genome, 'Guest AI');
    service.setReady('socket-host', true);
    service.setReady('socket-guest', true);

    expectRoomError(
      () => service.selectTrack('socket-guest', multiplayerTrack),
      'HOST_REQUIRED',
    );
    const selected = service.selectTrack('socket-host', multiplayerTrack);
    expect(selected.track).toEqual(multiplayerTrack);
    expect(selected.players.every((player) => !player.ready)).toBe(true);

    service.setReady('socket-host', true);
    service.setReady('socket-guest', true);
    expect(service.start('socket-host').state.status).toBe('COUNTDOWN');
  });

  it('transfers host and prevents joining multiple rooms', () => {
    const service = new RoomService();
    const created = service.create(
      { id: 'host', username: 'Host' },
      'host-socket',
      3,
    );
    service.join(
      created.code,
      { id: 'guest', username: 'Guest' },
      'guest-socket',
    );

    expectRoomError(
      () =>
        service.create({ id: 'guest', username: 'Guest' }, 'another-socket', 2),
      'ALREADY_IN_ROOM',
    );

    const result = service.leave('host-socket');
    expect(result?.state?.hostUserId).toBe('guest');
  });
});
