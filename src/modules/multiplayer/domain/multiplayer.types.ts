export type RoomStatus = 'LOBBY' | 'COUNTDOWN' | 'RACING' | 'FINISHED';

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
}

export interface PublicRoomState {
  code: string;
  hostUserId: string;
  status: RoomStatus;
  maxPlayers: number;
  players: Array<Pick<RoomPlayer, 'userId' | 'username' | 'ready'>>;
}
