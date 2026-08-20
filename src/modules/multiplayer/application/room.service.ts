import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { RaceSimulation } from '../domain/race.simulation';
import {
  PublicRoomState,
  RaceInput,
  RaceResult,
  RaceSnapshot,
  RoomPlayer,
  RoomStatus,
} from '../domain/multiplayer.types';

interface Room {
  code: string;
  hostUserId: string;
  status: RoomStatus;
  maxPlayers: number;
  players: Map<string, RoomPlayer>;
  race?: RaceSimulation;
  finishBroadcasted: boolean;
}

export class RoomError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface RoomTickUpdate {
  code: string;
  state: PublicRoomState;
  snapshot: RaceSnapshot;
  result: RaceResult | null;
}

@Injectable()
export class RoomService {
  private readonly rooms = new Map<string, Room>();
  private readonly roomBySocket = new Map<string, string>();
  private readonly roomByUser = new Map<string, string>();

  create(
    user: { id: string; username: string },
    socketId: string,
    maxPlayers: number,
  ): PublicRoomState {
    this.ensureAvailable(user.id);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
      throw new RoomError(
        'INVALID_CAPACITY',
        'Room capacity must be between 2 and 4',
      );
    }

    const code = this.createCode();
    const player: RoomPlayer = {
      userId: user.id,
      username: user.username,
      socketId,
      ready: false,
    };
    const room: Room = {
      code,
      hostUserId: user.id,
      status: 'LOBBY',
      maxPlayers,
      players: new Map([[user.id, player]]),
      finishBroadcasted: false,
    };
    this.rooms.set(code, room);
    this.indexPlayer(player, code);
    return this.publicState(room);
  }

  join(
    codeInput: string,
    user: { id: string; username: string },
    socketId: string,
  ): PublicRoomState {
    this.ensureAvailable(user.id);
    const room = this.rooms.get(codeInput.trim().toUpperCase());
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Room not found');
    if (room.status !== 'LOBBY') {
      throw new RoomError('RACE_STARTED', 'The race has already started');
    }
    if (room.players.size >= room.maxPlayers) {
      throw new RoomError('ROOM_FULL', 'Room is full');
    }

    const player: RoomPlayer = {
      userId: user.id,
      username: user.username,
      socketId,
      ready: false,
    };
    room.players.set(user.id, player);
    this.indexPlayer(player, room.code);
    return this.publicState(room);
  }

  leave(
    socketId: string,
  ): { code: string; state: PublicRoomState | null } | null {
    const code = this.roomBySocket.get(socketId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;

    const player = [...room.players.values()].find(
      (candidate) => candidate.socketId === socketId,
    );
    if (!player) return null;
    this.roomBySocket.delete(socketId);
    this.roomByUser.delete(player.userId);

    if (room.status === 'RACING' || room.status === 'COUNTDOWN') {
      room.race?.disconnect(player.userId);
    }
    room.players.delete(player.userId);

    if (room.players.size === 0) {
      this.rooms.delete(code);
      return { code, state: null };
    }
    if (room.hostUserId === player.userId && room.status === 'LOBBY') {
      const nextHost = room.players.values().next();
      room.hostUserId = nextHost.done ? '' : nextHost.value.userId;
    }
    return { code, state: this.publicState(room) };
  }

  setReady(socketId: string, ready: boolean): PublicRoomState {
    const { room, player } = this.requireMembership(socketId);
    if (room.status !== 'LOBBY')
      throw new RoomError('INVALID_STATE', 'Race is not in lobby');
    player.ready = Boolean(ready);
    return this.publicState(room);
  }

  start(
    socketId: string,
    now = Date.now(),
  ): { state: PublicRoomState; startAt: number } {
    const { room, player } = this.requireMembership(socketId);
    if (room.hostUserId !== player.userId) {
      throw new RoomError('HOST_REQUIRED', 'Only the host can start the race');
    }
    if (room.players.size < 2) {
      throw new RoomError(
        'PLAYERS_REQUIRED',
        'At least two players are required',
      );
    }
    if ([...room.players.values()].some((candidate) => !candidate.ready)) {
      throw new RoomError('NOT_READY', 'Every player must be ready');
    }

    room.race = new RaceSimulation(
      [...room.players.values()].map((candidate) => ({
        userId: candidate.userId,
        username: candidate.username,
      })),
      now,
    );
    room.status = 'COUNTDOWN';
    return { state: this.publicState(room), startAt: room.race.startAt };
  }

  submitInput(socketId: string, input: RaceInput): boolean {
    const { room, player } = this.requireMembership(socketId);
    if (!room.race) return false;
    return room.race.submitInput(player.userId, input);
  }

  roomCodeForSocket(socketId: string): string | undefined {
    return this.roomBySocket.get(socketId);
  }

  tick(now = Date.now()): RoomTickUpdate[] {
    const updates: RoomTickUpdate[] = [];
    for (const room of this.rooms.values()) {
      if (!room.race) continue;
      const snapshot = room.race.tick(now);
      room.status = snapshot.status;
      const result = room.race.result();
      const shouldBroadcastResult = Boolean(result) && !room.finishBroadcasted;
      if (shouldBroadcastResult) room.finishBroadcasted = true;
      updates.push({
        code: room.code,
        state: this.publicState(room),
        snapshot,
        result: shouldBroadcastResult ? result : null,
      });
    }
    return updates;
  }

  private ensureAvailable(userId: string): void {
    if (this.roomByUser.has(userId)) {
      throw new RoomError('ALREADY_IN_ROOM', 'Leave the current room first');
    }
  }

  private requireMembership(socketId: string): {
    room: Room;
    player: RoomPlayer;
  } {
    const code = this.roomBySocket.get(socketId);
    const room = code ? this.rooms.get(code) : undefined;
    const player = room
      ? [...room.players.values()].find(
          (candidate) => candidate.socketId === socketId,
        )
      : undefined;
    if (!room || !player)
      throw new RoomError('NOT_IN_ROOM', 'Join a room first');
    return { room, player };
  }

  private indexPlayer(player: RoomPlayer, code: string): void {
    this.roomBySocket.set(player.socketId, code);
    this.roomByUser.set(player.userId, code);
  }

  private createCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      const bytes = randomBytes(6);
      code = [...bytes]
        .map((value) => alphabet[value % alphabet.length])
        .join('');
    } while (this.rooms.has(code));
    return code;
  }

  private publicState(room: Room): PublicRoomState {
    return {
      code: room.code,
      hostUserId: room.hostUserId,
      status: room.status,
      maxPlayers: room.maxPlayers,
      players: [...room.players.values()].map((player) => ({
        userId: player.userId,
        username: player.username,
        ready: player.ready,
      })),
    };
  }
}
