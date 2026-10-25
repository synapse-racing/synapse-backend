import { RaceSimulation, isDrivable, senseTrack } from './race.simulation';
import type { NeatGenome } from './neat-controller';
import { generateTrack } from './track';

const autonomousGenome: NeatGenome = {
  id: 'golden-pilot',
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
  connections: [
    { innovation: 1, source: 6, target: 8, weight: 2, enabled: true },
  ],
};

describe('RaceSimulation', () => {
  it('recognizes the rectangular road and inner island', () => {
    expect(isDrivable(-10, 0)).toBe(true);
    expect(isDrivable(0, 0)).toBe(false);
    expect(isDrivable(14, 0)).toBe(false);
  });

  it('uses generated geometry and spawn coordinates', () => {
    const track = generateTrack({ version: 'curved-loop-v1', seed: 7 });
    const race = new RaceSimulation(
      [{ userId: 'u1', username: 'driver' }],
      1000,
      track,
    );
    const player = race.tick(race.startAt - 1).players[0];

    expect({ x: player.x, z: player.z, yaw: player.yaw }).toEqual(track.spawn);
    expect(isDrivable(track.spawn.x, track.spawn.z, track)).toBe(true);
    expect(isDrivable(0, 0, track)).toBe(false);
  });

  it('starts every genome from the same pose used in training', () => {
    const race = new RaceSimulation(
      [
        { userId: 'u1', username: 'first' },
        { userId: 'u2', username: 'second' },
      ],
      1000,
    );
    const snapshot = race.tick(race.startAt - 1);

    expect(snapshot.players.map(({ x, z, yaw }) => ({ x, z, yaw }))).toEqual([
      { x: -10, z: 13, yaw: 0 },
      { x: -10, z: 13, yaw: 0 },
    ]);
  });

  it('ignores stale inputs and advances ordered checkpoints', () => {
    const race = new RaceSimulation(
      [{ userId: 'u1', username: 'driver' }],
      1000,
    );
    expect(
      race.submitInput('u1', { sequence: 1, steering: 0, throttle: 1 }),
    ).toBe(true);
    expect(
      race.submitInput('u1', { sequence: 1, steering: 1, throttle: -1 }),
    ).toBe(false);

    let snapshot = race.tick(race.startAt);
    for (let tick = 1; tick <= 220; tick += 1) {
      snapshot = race.tick(race.startAt + tick * 50);
    }

    expect(snapshot.players[0].passedCheckpoints).toBe(1);
    expect(snapshot.players[0].expectedCheckpoint).toBe(1);
    expect(snapshot.players[0].z).toBeGreaterThan(-24);
  });

  it('marks disconnected players and finishes without active competitors', () => {
    const race = new RaceSimulation([{ userId: 'u1', username: 'driver' }], 0);
    race.disconnect('u1');
    const snapshot = race.tick(race.startAt);

    expect(snapshot.status).toBe('FINISHED');
    expect(snapshot.players[0].disconnected).toBe(true);
    expect(race.result()).not.toBeNull();
  });

  it('matches the shared golden autonomous trajectory', () => {
    const race = new RaceSimulation(
      [{ userId: 'u1', username: 'driver', genome: autonomousGenome }],
      1000,
    );
    let snapshot = race.tick(race.startAt);
    for (let step = 1; step < 20; step += 1) {
      snapshot = race.tick(race.startAt + step * 50);
    }

    expect(snapshot.players[0].x).toBe(-10);
    expect(snapshot.players[0].yaw).toBe(0);
    expect(snapshot.players[0].speed).toBeCloseTo(5.266136972643145, 12);
    expect(snapshot.players[0].z).toBeCloseTo(9.843669933934567, 12);
  });

  it('keeps left and right sensors in the training angle order', () => {
    const sensors = senseTrack(-11, 10, 0);
    expect(sensors[0]).not.toBe(sensors[4]);
    expect(sensors).toHaveLength(5);
  });

  it('eliminates an autonomous player on its first wall collision', () => {
    const race = new RaceSimulation(
      [{ userId: 'u1', username: 'driver', genome: autonomousGenome }],
      1000,
    );
    let snapshot = race.tick(race.startAt);
    for (
      let step = 1;
      step < 560 && snapshot.status !== 'FINISHED';
      step += 1
    ) {
      snapshot = race.tick(race.startAt + step * 50);
    }

    expect(snapshot.status).toBe('FINISHED');
    expect(snapshot.players[0].eliminated).toBe(true);
    expect(snapshot.players[0].finishedAt).toBeNull();
  });

  it('eliminates an autonomous player after three seconds stopped', () => {
    const stoppedGenome: NeatGenome = {
      ...autonomousGenome,
      id: 'stopped-pilot',
      connections: [],
    };
    const race = new RaceSimulation(
      [{ userId: 'u1', username: 'driver', genome: stoppedGenome }],
      1000,
    );
    let snapshot = race.tick(race.startAt);
    for (let step = 1; step < 60; step += 1) {
      snapshot = race.tick(race.startAt + step * 50);
    }

    expect(snapshot.status).toBe('FINISHED');
    expect(snapshot.players[0].eliminationReason).toBe('STALLED');
  });
});

describe('accelerated simulation', () => {
  it.each([2, 4])(
    'preserves physics at %ix and keeps countdown in real time',
    (speed) => {
      const competitors = [
        { userId: 'pilot', username: 'Pilot', genome: autonomousGenome },
      ];
      const normal = new RaceSimulation(competitors, 1000);
      const accelerated = new RaceSimulation(competitors, 1000);
      expect(accelerated.tick(3999, speed).status).toBe('COUNTDOWN');
      let expected = normal.tick(4000);
      for (let step = 1; step < speed * 5; step++)
        expected = normal.tick(4000 + step * 50);
      let actual = accelerated.tick(4000, speed);
      for (let step = 1; step < 5; step++)
        actual = accelerated.tick(4000 + step * 50, speed);
      expect(actual.players).toEqual(expected.players);
      expect(actual.status).toBe(expected.status);
      expect(actual.serverTime).toBe(4200);
      expect(accelerated.tick(4250, 1).players).toEqual(
        normal.tick(4000 + speed * 5 * 50).players,
      );
    },
  );

  it('uses simulation time for stall elimination at accelerated speeds', () => {
    const race = new RaceSimulation([{ userId: 'idle', username: 'Idle' }], 0);
    for (let tick = 0; tick < 14; tick++)
      expect(race.tick(3000 + tick * 50, 4).status).toBe('RACING');
    const finished = race.tick(3700, 4);
    expect(finished.status).toBe('FINISHED');
    expect(finished.players[0].eliminationReason).toBe('STALLED');
  });
});

it.each([-1, 1])(
  'finishes at road edge %i and retains the final pose',
  (side) => {
    const track = generateTrack({ version: 'grand-prix-v3', seed: 42170 });
    if (track.geometry.kind === 'rectangular-ring')
      throw new Error('Expected curved track');
    const finish = track.checkpoints.at(-1)!;
    const lateral = side * (track.geometry.driveHalfWidth - 0.05);
    const race = new RaceSimulation(
      [{ userId: 'pilot', username: 'Pilot' }],
      0,
      {
        ...track,
        checkpoints: [finish],
        spawn: {
          x:
            finish.x +
            Math.cos(finish.yaw) * lateral +
            Math.sin(finish.yaw) * 0.501,
          z:
            finish.z -
            Math.sin(finish.yaw) * lateral +
            Math.cos(finish.yaw) * 0.501,
          yaw: finish.yaw,
        },
      },
    );
    race.submitInput('pilot', { sequence: 1, steering: 0, throttle: 1 });
    const snapshot = race.tick(race.startAt, 4);
    expect(snapshot.status).toBe('FINISHED');
    expect(snapshot.players[0].laps).toBe(1);
    expect(snapshot.players[0].eliminated).toBe(false);
    expect(race.tick(race.startAt + 50, 4).players).toEqual(snapshot.players);
  },
);

describe('host elimination', () => {
  it('stops only an active target, ignores duplicate orders and finishes when none remain', () => {
    const race = new RaceSimulation(
      [
        { userId: 'host', username: 'Host' },
        { userId: 'guest', username: 'Guest' },
      ],
      0,
    );
    expect(race.eliminate('guest')).toBe(false);
    race.submitInput('host', { sequence: 1, steering: 0, throttle: 1 });
    race.submitInput('guest', { sequence: 1, steering: 0, throttle: 1 });
    const first = race.tick(race.startAt);
    expect(race.eliminate('unknown', 3000)).toBe(false);
    expect(race.eliminate('guest', 3000)).toBe(true);
    expect(race.eliminate('guest', 3000)).toBe(true);
    expect(
      race.submitInput('guest', { sequence: 2, steering: 1, throttle: 1 }),
    ).toBe(false);
    const after = race.tick(3050);
    const guest = after.players.find((p) => p.userId === 'guest')!;
    expect(guest).toMatchObject({
      x: first.players[1].x,
      z: first.players[1].z,
      speed: 0,
      eliminated: true,
      eliminationReason: 'HOST',
      disconnected: false,
    });
    expect(after.status).toBe('RACING');
    expect(race.eliminate('host', 3060)).toBe(true);
    expect(race.result()).toMatchObject({ finishedAt: 3060 });
    expect(race.tick(3100).status).toBe('FINISHED');
  });

  it('does not eliminate disconnected or completed competitors', () => {
    const track = generateTrack({ version: 'rectangular-ring-v1', seed: 0 });
    const race = new RaceSimulation(
      [{ userId: 'pilot', username: 'Pilot' }],
      0,
      {
        ...track,
        checkpoints: [
          {
            x: track.spawn.x,
            z: track.spawn.z,
            yaw: 0,
            halfWidth: 4,
            halfDepth: 4,
          },
        ],
      },
    );
    expect(race.tick(3000).players[0].finishedAt).not.toBeNull();
    expect(race.eliminate('pilot', 3050)).toBe(false);
    const disconnected = new RaceSimulation(
      [{ userId: 'pilot', username: 'Pilot' }],
      0,
    );
    disconnected.tick(3000);
    disconnected.disconnect('pilot');
    expect(disconnected.eliminate('pilot', 3050)).toBe(false);
  });
});
