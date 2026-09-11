import {
  RaceInput,
  RacePlayerState,
  RaceResult,
  RaceSnapshot,
  RoomStatus,
} from './multiplayer.types';
import { evaluateNeatGenome, type NeatGenome } from './neat-controller';
import { generateTrack, prototypeTrackRecipe, type RaceTrack } from './track';

interface InternalPlayer extends RacePlayerState {
  input: RaceInput;
  insideCheckpoints: Set<number>;
  genome?: NeatGenome;
  stationarySteps: number;
}

const tickSeconds = 1 / 20;
const maxRaceSteps = 28 / tickSeconds;

export class RaceSimulation {
  readonly startAt: number;
  status: RoomStatus = 'COUNTDOWN';

  private readonly players = new Map<string, InternalPlayer>();
  private finishedAt: number | null = null;
  private elapsedSteps = 0;

  constructor(
    competitors: Array<{
      userId: string;
      username: string;
      genome?: NeatGenome;
    }>,
    createdAt = Date.now(),
    private readonly track: RaceTrack = generateTrack(prototypeTrackRecipe),
  ) {
    this.startAt = createdAt + 3000;
    competitors.forEach((competitor, index) => {
      this.players.set(competitor.userId, {
        ...competitor,
        x: track.spawn.x,
        z: track.spawn.z,
        yaw: track.spawn.yaw,
        speed: 0,
        expectedCheckpoint: 0,
        passedCheckpoints: 0,
        laps: 0,
        finishedAt: null,
        disconnected: false,
        eliminated: false,
        eliminationReason: null,
        stationarySteps: 0,
        rank: index + 1,
        input: { sequence: -1, steering: 0, throttle: 0 },
        insideCheckpoints: new Set(),
      });
    });
  }

  submitInput(userId: string, input: RaceInput): boolean {
    const player = this.players.get(userId);
    if (!player || player.finishedAt || player.disconnected) return false;
    if (
      !Number.isInteger(input.sequence) ||
      input.sequence <= player.input.sequence
    ) {
      return false;
    }
    if (!Number.isFinite(input.steering) || !Number.isFinite(input.throttle)) {
      return false;
    }

    player.input = {
      sequence: input.sequence,
      steering: Math.max(-1, Math.min(1, input.steering)),
      throttle: Math.max(-1, Math.min(1, input.throttle)),
    };
    return true;
  }

  disconnect(userId: string): void {
    const player = this.players.get(userId);
    if (player) player.disconnected = true;
  }

  tick(now = Date.now()): RaceSnapshot {
    if (this.status === 'FINISHED') return this.snapshot(now);
    if (now < this.startAt) return this.snapshot(now);
    if (this.status === 'COUNTDOWN') {
      this.status = 'RACING';
    }

    for (const player of this.players.values()) {
      if (player.finishedAt || player.disconnected || player.eliminated)
        continue;
      const collided = this.integratePlayer(player, now);
      player.stationarySteps =
        Math.abs(player.speed) < 0.35 ? player.stationarySteps + 1 : 0;
      if (collided || player.stationarySteps * tickSeconds >= 3) {
        player.eliminated = true;
        player.eliminationReason = collided ? 'COLLISION' : 'STALLED';
      }
    }
    this.elapsedSteps += 1;

    const activePlayers = [...this.players.values()].filter(
      (player) =>
        !player.finishedAt && !player.disconnected && !player.eliminated,
    );
    if (
      activePlayers.length === 0 ||
      this.elapsedSteps >=
        (this.track.recipe.version === 'technical-loop-v2'
          ? 180 / tickSeconds
          : maxRaceSteps)
    ) {
      this.status = 'FINISHED';
      this.finishedAt = now;
    }

    this.updateRanks();
    return this.snapshot(now);
  }

  result(): RaceResult | null {
    if (this.status !== 'FINISHED' || this.finishedAt === null) return null;
    return {
      finishedAt: this.finishedAt,
      players: this.publicPlayers(),
    };
  }

  private integratePlayer(player: InternalPlayer, now: number): boolean {
    if (player.genome) {
      const [steering, throttle] = evaluateNeatGenome(player.genome, [
        ...senseTrack(player.x, player.z, player.yaw, this.track),
        Math.min(1, Math.abs(player.speed) / 13),
      ]);
      player.input = {
        sequence: player.input.sequence + 1,
        steering,
        throttle,
      };
    }
    player.speed += player.input.throttle * 8.5 * tickSeconds;
    player.speed *= Math.pow(0.985, tickSeconds * 60);
    player.speed = Math.max(-4.5, Math.min(12, player.speed));

    const speedFactor = Math.min(1, Math.abs(player.speed) / 6);
    const reverse = player.speed < 0 ? -1 : 1;
    player.yaw +=
      player.input.steering * reverse * speedFactor * 1.9 * tickSeconds;

    const previousX = player.x;
    const previousZ = player.z;
    player.x += -Math.sin(player.yaw) * player.speed * tickSeconds;
    player.z += -Math.cos(player.yaw) * player.speed * tickSeconds;

    if (!isDrivable(player.x, player.z, this.track)) {
      player.x = previousX;
      player.z = previousZ;
      player.speed *= -0.2;
      return true;
    }

    this.track.checkpoints.forEach((checkpoint, index) => {
      const dx = player.x - checkpoint.x;
      const dz = player.z - checkpoint.z;
      const cosine = Math.cos(checkpoint.yaw);
      const sine = Math.sin(checkpoint.yaw);
      const localX = cosine * dx - sine * dz;
      const localZ = sine * dx + cosine * dz;
      const inside =
        Math.abs(localX) <= checkpoint.halfWidth &&
        Math.abs(localZ) <= checkpoint.halfDepth;
      const wasInside = player.insideCheckpoints.has(index);
      if (inside) player.insideCheckpoints.add(index);
      else player.insideCheckpoints.delete(index);

      if (inside && !wasInside && index === player.expectedCheckpoint) {
        player.passedCheckpoints += 1;
        if (index === this.track.checkpoints.length - 1) {
          player.laps += 1;
          player.expectedCheckpoint = 0;
          player.finishedAt = now;
        } else {
          player.expectedCheckpoint += 1;
        }
      }
    });
    return false;
  }

  private updateRanks(): void {
    const sorted = [...this.players.values()].sort((left, right) => {
      if (left.finishedAt && right.finishedAt)
        return left.finishedAt - right.finishedAt;
      if (left.finishedAt) return -1;
      if (right.finishedAt) return 1;
      if (left.eliminated !== right.eliminated) return left.eliminated ? 1 : -1;
      if (left.laps !== right.laps) return right.laps - left.laps;
      return right.passedCheckpoints - left.passedCheckpoints;
    });
    sorted.forEach((player, index) => {
      player.rank = index + 1;
    });
  }

  private snapshot(now: number): RaceSnapshot {
    return {
      serverTime: now,
      startAt: this.startAt,
      status: this.status,
      players: this.publicPlayers(),
    };
  }

  private publicPlayers(): RacePlayerState[] {
    return [...this.players.values()]
      .sort((left, right) => left.rank - right.rank)
      .map((player) => ({
        userId: player.userId,
        username: player.username,
        x: player.x,
        z: player.z,
        yaw: player.yaw,
        speed: player.speed,
        expectedCheckpoint: player.expectedCheckpoint,
        passedCheckpoints: player.passedCheckpoints,
        laps: player.laps,
        finishedAt: player.finishedAt,
        disconnected: player.disconnected,
        eliminated: player.eliminated,
        eliminationReason: player.eliminationReason,
        rank: player.rank,
      }));
  }
}

const sensorAngles = [-60, -30, 0, 30, 60].map(
  (degrees) => (degrees * Math.PI) / 180,
);
export function senseTrack(
  x: number,
  z: number,
  yaw: number,
  track: RaceTrack = generateTrack(prototypeTrackRecipe),
): number[] {
  const originX = x - Math.sin(yaw) * 1.25;
  const originZ = z - Math.cos(yaw) * 1.25;
  return sensorAngles.map((angle) => {
    const directionX = -Math.sin(yaw - angle);
    const directionZ = -Math.cos(yaw - angle);
    let nearest = 8;
    for (const [x1, z1, x2, z2] of track.boundaries) {
      const segmentX = x2 - x1;
      const segmentZ = z2 - z1;
      const denominator = directionX * segmentZ - directionZ * segmentX;
      if (Math.abs(denominator) < 1e-9) continue;
      const offsetX = x1 - originX;
      const offsetZ = z1 - originZ;
      const distance = (offsetX * segmentZ - offsetZ * segmentX) / denominator;
      const segmentPosition =
        (offsetX * directionZ - offsetZ * directionX) / denominator;
      if (distance >= 0 && segmentPosition >= 0 && segmentPosition <= 1) {
        nearest = Math.min(nearest, distance);
      }
    }
    return Math.min(1, nearest / 8);
  });
}

export function isDrivable(
  x: number,
  z: number,
  track: RaceTrack = generateTrack(prototypeTrackRecipe),
): boolean {
  if (track.geometry.kind === 'rectangular-ring') {
    const { outerX, outerZ, innerX, innerZ } = track.geometry;
    const insideOuter = Math.abs(x) < outerX && Math.abs(z) < outerZ;
    const outsideIsland = Math.abs(x) > innerX || Math.abs(z) > innerZ;
    return insideOuter && outsideIsland;
  }
  const { centerline, driveHalfWidth } = track.geometry;
  return centerline.some((start, index) => {
    const end = centerline[(index + 1) % centerline.length];
    const segmentX = end[0] - start[0];
    const segmentZ = end[1] - start[1];
    const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    const projection = Math.max(
      0,
      Math.min(
        1,
        ((x - start[0]) * segmentX + (z - start[1]) * segmentZ) / lengthSquared,
      ),
    );
    return (
      Math.hypot(
        x - (start[0] + segmentX * projection),
        z - (start[1] + segmentZ * projection),
      ) < driveHalfWidth
    );
  });
}
