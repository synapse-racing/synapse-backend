import {
  RaceInput,
  RacePlayerState,
  RaceResult,
  RaceSnapshot,
  RoomStatus,
} from './multiplayer.types';

interface InternalPlayer extends RacePlayerState {
  input: RaceInput;
  insideCheckpoints: Set<number>;
}

const tickSeconds = 1 / 20;
const maxRaceMs = 180_000;
const checkpoints = [
  { x: -10, z: 0, halfWidth: 3.7, halfDepth: 0.5 },
  { x: 0, z: -20, halfWidth: 0.5, halfDepth: 3.7 },
  { x: 10, z: 0, halfWidth: 3.7, halfDepth: 0.5 },
  { x: 0, z: 20, halfWidth: 0.5, halfDepth: 3.7 },
];

export class RaceSimulation {
  readonly startAt: number;
  status: RoomStatus = 'COUNTDOWN';

  private readonly players = new Map<string, InternalPlayer>();
  private startedAt: number | null = null;
  private finishedAt: number | null = null;

  constructor(
    competitors: Array<{ userId: string; username: string }>,
    createdAt = Date.now(),
  ) {
    this.startAt = createdAt + 3000;
    competitors.forEach((competitor, index) => {
      this.players.set(competitor.userId, {
        ...competitor,
        x: -10 + (index % 2) * 1.4,
        z: 13 + Math.floor(index / 2) * 1.6,
        yaw: 0,
        speed: 0,
        expectedCheckpoint: 0,
        passedCheckpoints: 0,
        laps: 0,
        finishedAt: null,
        disconnected: false,
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
      this.startedAt = this.startAt;
    }

    for (const player of this.players.values()) {
      if (player.finishedAt || player.disconnected) continue;
      this.integratePlayer(player, now);
    }

    const activePlayers = [...this.players.values()].filter(
      (player) => !player.finishedAt && !player.disconnected,
    );
    if (
      activePlayers.length === 0 ||
      (this.startedAt !== null && now - this.startedAt >= maxRaceMs)
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

  private integratePlayer(player: InternalPlayer, now: number): void {
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

    if (!isDrivable(player.x, player.z)) {
      player.x = previousX;
      player.z = previousZ;
      player.speed *= -0.2;
    }

    checkpoints.forEach((checkpoint, index) => {
      const inside =
        Math.abs(player.x - checkpoint.x) <= checkpoint.halfWidth &&
        Math.abs(player.z - checkpoint.z) <= checkpoint.halfDepth;
      const wasInside = player.insideCheckpoints.has(index);
      if (inside) player.insideCheckpoints.add(index);
      else player.insideCheckpoints.delete(index);

      if (inside && !wasInside && index === player.expectedCheckpoint) {
        player.passedCheckpoints += 1;
        if (index === checkpoints.length - 1) {
          player.laps += 1;
          player.expectedCheckpoint = 0;
          player.finishedAt = now;
        } else {
          player.expectedCheckpoint += 1;
        }
      }
    });
  }

  private updateRanks(): void {
    const sorted = [...this.players.values()].sort((left, right) => {
      if (left.finishedAt && right.finishedAt)
        return left.finishedAt - right.finishedAt;
      if (left.finishedAt) return -1;
      if (right.finishedAt) return 1;
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
        rank: player.rank,
      }));
  }
}

export function isDrivable(x: number, z: number): boolean {
  const insideOuter = Math.abs(x) < 13.35 && Math.abs(z) < 23.35;
  const outsideIsland = Math.abs(x) > 6.65 || Math.abs(z) > 16.65;
  return insideOuter && outsideIsland;
}
