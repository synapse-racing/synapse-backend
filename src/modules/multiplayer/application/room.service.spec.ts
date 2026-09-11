import { RoomError, RoomService, type RoomTickUpdate } from './room.service';
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

function finishRace(service: RoomService, now: number): RoomTickUpdate {
  for (let time = now; time <= now + 90000; time += 50) {
    const update = service.tick(time)[0];
    if (update?.result) return update;
  }
  throw new Error('Race did not finish');
}

describe('race rematches', () => {
  it('retains the room and genomes, resets readiness, and finishes a second race', () => {
    const service = new RoomService();
    const room = service.create({ id: 'host', username: 'Host' }, 'host', 3);
    service.join(room.code, { id: 'guest', username: 'Guest' }, 'guest');
    service.selectGenome('host', genome, 'Host AI');
    service.selectGenome('guest', genome, 'Guest AI');
    for (const now of [1000, 100000]) {
      service.setReady('host', true);
      service.setReady('guest', true);
      service.start('host', now);
      expectRoomError(() => service.start('host', now), 'INVALID_STATE');
      const finished = finishRace(service, now);
      expect(finished.result).not.toBeNull();
      expect(finished.snapshot.status).toBe('FINISHED');
      expect(finished.state).toMatchObject({
        code: room.code,
        status: 'LOBBY',
        track: room.track,
      });
      expect(finished.state.players).toEqual([
        {
          userId: 'host',
          username: 'Host',
          ready: false,
          genomeName: 'Host AI',
        },
        {
          userId: 'guest',
          username: 'Guest',
          ready: false,
          genomeName: 'Guest AI',
        },
      ]);
      expect(service.tick(now + 61000)).toEqual([]);
      expectRoomError(() => service.start('host', now + 62000), 'NOT_READY');
    }
    expect(
      service.join(room.code, { id: 'new', username: 'New' }, 'new').players,
    ).toHaveLength(3);
  });

  it('retains a valid host when the original host leaves during a race', () => {
    const service = new RoomService();
    const room = service.create({ id: 'host', username: 'Host' }, 'host', 2);
    service.join(room.code, { id: 'guest', username: 'Guest' }, 'guest');
    for (const socket of ['host', 'guest']) {
      service.selectGenome(socket, genome, socket);
      service.setReady(socket, true);
    }
    service.start('host', 1000);
    expect(service.leave('host')?.state?.hostUserId).toBe('guest');
    const finished = finishRace(service, 1000);
    expect(finished.state.hostUserId).toBe('guest');
    expect(service.selectTrack('guest', multiplayerTrack).track).toEqual(
      multiplayerTrack,
    );
  });
});
