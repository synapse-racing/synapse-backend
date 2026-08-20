import { RaceSimulation, isDrivable } from './race.simulation';

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
});
