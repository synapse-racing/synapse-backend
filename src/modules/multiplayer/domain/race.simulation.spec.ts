import { RaceSimulation, isDrivable, senseTrack } from './race.simulation';
import type { NeatGenome } from './neat-controller';

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
