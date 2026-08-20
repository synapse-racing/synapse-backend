export type RoomStatus = 'LOBBY' | 'COUNTDOWN' | 'RACING' | 'FINISHED';
export type EliminationReason = 'COLLISION' | 'STALLED';

export interface RaceInput {
  sequence: number;
  steering: number;
  throttle: number;
}

export interface RacePlayerState {
  userId: string;
  username: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  expectedCheckpoint: number;
  passedCheckpoints: number;
  laps: number;
  finishedAt: number | null;
  disconnected: boolean;
  eliminated: boolean;
  eliminationReason: EliminationReason | null;
  rank: number;
}

export interface RaceSnapshot {
  serverTime: number;
  startAt: number;
  status: RoomStatus;
  players: RacePlayerState[];
}

export interface RaceResult {
  finishedAt: number;
  players: RacePlayerState[];
}

export interface RoomPlayer {
  userId: string;
  username: string;
  socketId: string;
  ready: boolean;
  genome: NeatGenome | null;
  genomeName: string | null;
}

export interface PublicRoomState {
  code: string;
  hostUserId: string;
  status: RoomStatus;
  maxPlayers: number;
  players: Array<
    Pick<RoomPlayer, 'userId' | 'username' | 'ready' | 'genomeName'>
  >;
}
import type { NeatGenome } from './neat-controller';
