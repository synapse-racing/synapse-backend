import { RoomError, RoomService, type RoomTickUpdate } from './room.service';
import {
  defaultAppearance,
  type VehicleAppearance,
} from '../../garage/domain/vehicle-appearance';
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
          appearance: { ...defaultAppearance },
        },
        {
          userId: 'guest',
          username: 'Guest',
          ready: false,
          genomeName: 'Guest AI',
          appearance: { ...defaultAppearance },
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

it('restricts speed changes to the current host and rejects invalid speeds', () => {
  const service = new RoomService();
  const created = service.create({ id: 'host', username: 'Host' }, 'host', 2);
  service.join(created.code, { id: 'guest', username: 'Guest' }, 'guest');
  expect(created.timeScale).toBe(1);
  expectRoomError(() => service.setTimeScale('guest', 4), 'HOST_REQUIRED');
  expectRoomError(() => service.setTimeScale('outsider', 4), 'NOT_IN_ROOM');
  for (const speed of [0, -1, 3, 100, NaN, Infinity]) {
    expectRoomError(() => service.setTimeScale('host', speed), 'INVALID_SPEED');
  }
  expect(service.setTimeScale('host', 4).timeScale).toBe(4);
  expect(service.leave('host')?.state?.timeScale).toBe(4);
  expect(service.setTimeScale('guest', 1).timeScale).toBe(1);
});

it('supports 64 players and prevents a 65th player joining', () => {
  const service = new RoomService();
  const room = service.create({ id: 'p0', username: 'Player 0' }, 's0', 64);
  for (let i = 1; i < 64; i++) {
    const joined = service.join(
      room.code,
      { id: 'p' + i, username: 'Player ' + i },
      's' + i,
    );
    expect(joined.players).toHaveLength(i + 1);
  }
  expectRoomError(
    () => service.join(room.code, { id: 'extra', username: 'Extra' }, 'extra'),
    'ROOM_FULL',
  );
});
it.each([0, 1, 65, 2.5, NaN, Infinity])(
  'rejects invalid capacity %s',
  (capacity) => {
    expectRoomError(
      () =>
        new RoomService().create(
          { id: 'host', username: 'Host' },
          'host',
          capacity,
        ),
      'INVALID_CAPACITY',
    );
  },
);

describe('host car controls', () => {
  function readyRoom(count = 2) {
    const service = new RoomService();
    const room = service.create(
      { id: 'host', username: 'Host' },
      'host',
      count,
    );
    for (let index = 1; index < count; index++)
      service.join(
        room.code,
        { id: 'guest' + index, username: 'Guest' },
        'guest' + index,
      );
    for (const socket of [
      'host',
      ...Array.from({ length: count - 1 }, (_, i) => 'guest' + (i + 1)),
    ]) {
      service.selectGenome(socket, genome, 'Pilot');
      service.setReady(socket, true);
    }
    const { startAt } = service.start('host', 1000);
    return { service, startAt };
  }

  it('validates host, membership, race identity and preserves players for a rematch', () => {
    const { service, startAt } = readyRoom();
    expectRoomError(
      () => service.eliminateCar('host', 'guest1', startAt),
      'INVALID_STATE',
    );
    service.tick(startAt);
    expectRoomError(
      () => service.eliminateCar('guest1', 'host', startAt),
      'HOST_REQUIRED',
    );
    expectRoomError(
      () => service.eliminateCar('outsider', 'host', startAt),
      'NOT_IN_ROOM',
    );
    expectRoomError(
      () => service.eliminateCar('host', 'outsider', startAt),
      'PLAYER_NOT_ACTIVE',
    );
    expectRoomError(
      () => service.eliminateCar('host', 'guest1', startAt - 1),
      'STALE_RACE',
    );
    service.eliminateCar('host', 'guest1', startAt);
    service.eliminateCar('host', 'guest1', startAt);
    const update = service.tick(startAt + 50)[0];
    expect(
      update.snapshot.players.find((p) => p.userId === 'guest1')
        ?.eliminationReason,
    ).toBe('HOST');
    expect(update.state.players).toHaveLength(2);
    service.eliminateCar('host', 'host', startAt);
    const finished = service.tick(startAt + 100)[0];
    expect(finished.snapshot.status).toBe('FINISHED');
    expect(finished.result).not.toBeNull();
    expect(finished.state.status).toBe('LOBBY');
    for (const socket of ['host', 'guest1']) service.setReady(socket, true);
    const rematch = service.start('host', 5000);
    service.tick(rematch.startAt);
    expectRoomError(
      () => service.eliminateCar('host', 'guest1', startAt),
      'STALE_RACE',
    );
  });

  it('transfers elimination permissions to the new host during a race', () => {
    const { service, startAt } = readyRoom(3);
    service.tick(startAt);
    expect(service.leave('host')?.state?.hostUserId).toBe('guest1');
    service.eliminateCar('guest1', 'guest2', startAt);
    expect(
      service
        .tick(startAt + 50)[0]
        .snapshot.players.find((p) => p.userId === 'guest2')?.eliminationReason,
    ).toBe('HOST');
  });
});

describe('race appearance snapshots', () => {
  function readyRoom() {
    const service = new RoomService();
    const created = service.create(
      { id: 'host', username: 'Host' },
      'host-socket',
      2,
    );
    service.join(
      created.code,
      { id: 'guest', username: 'Guest' },
      'guest-socket',
    );
    for (const socket of ['host-socket', 'guest-socket']) {
      service.selectGenome(socket, genome, 'Pilot');
      service.setReady(socket, true);
    }
    return { service, code: created.code };
  }

  it('refreshes equipped looks for each start and freezes copies during a race', async () => {
    const { service } = readyRoom();
    const appearance: VehicleAppearance = {
      ...defaultAppearance,
      modelId: 'gt',
      number: 23,
    };
    const appearances = new Map([
      ['host', appearance],
      ['guest', { ...defaultAppearance }],
    ]);
    const load = jest.fn().mockResolvedValue(appearances);
    const start = await service.startWithAppearances('host-socket', load);
    expect(load).toHaveBeenCalledWith(['host', 'guest']);
    expect(
      start.state.players.find((p) => p.userId === 'host')?.appearance,
    ).toEqual(appearance);
    appearance.modelId = 'prototype';
    start.state.players[0].appearance.primaryColor = '#000000';
    const snapshot = service.tick(start.startAt)[0].snapshot;
    expect(
      snapshot.players.find((p) => p.userId === 'host')?.appearance,
    ).toMatchObject({
      modelId: 'gt',
      primaryColor: defaultAppearance.primaryColor,
      number: 23,
    });
    snapshot.players[0].appearance!.number = 99;
    expect(
      service.tick(start.startAt + 50)[0].snapshot.players[0].appearance
        ?.number,
    ).toBe(23);
    service.eliminateCar('host-socket', 'guest', start.startAt);
    service.eliminateCar('host-socket', 'host', start.startAt);
    service.tick(start.startAt + 100);
    service.setReady('host-socket', true);
    service.setReady('guest-socket', true);
    const next = await service.startWithAppearances('host-socket', load);
    expect(
      next.state.players.find((p) => p.userId === 'host')?.appearance.modelId,
    ).toBe('prototype');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rejects a changed roster and a second start while appearance reads are pending', async () => {
    const { service, code } = readyRoom();
    let finish!: (appearances: ReadonlyMap<string, VehicleAppearance>) => void;
    const pending = service.startWithAppearances(
      'host-socket',
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    service.leave('guest-socket');
    service.join(
      code,
      { id: 'guest', username: 'Guest' },
      'replacement-socket',
    );
    service.selectGenome('replacement-socket', genome, 'Pilot');
    service.setReady('replacement-socket', true);
    finish(new Map());
    await expect(pending).rejects.toMatchObject({ code: 'ROOM_CHANGED' });
    const attempts = await Promise.allSettled([
      service.startWithAppearances('host-socket', () =>
        Promise.resolve(new Map()),
      ),
      service.startWithAppearances('host-socket', () =>
        Promise.resolve(new Map()),
      ),
    ]);
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((a) => a.status === 'rejected')).toHaveLength(1);
  });

  it('does not load appearance data for a non-host start', async () => {
    const { service } = readyRoom();
    const load = jest.fn();
    await expect(
      service.startWithAppearances('guest-socket', load),
    ).rejects.toMatchObject({ code: 'HOST_REQUIRED' });
    expect(load).not.toHaveBeenCalled();
  });
});
