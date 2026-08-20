import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PublicUser, UsersService } from '../../users/users.service';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
  SessionResult,
} from '../domain/auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async register(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<SessionResult> {
    const user = await this.usersService.create({
      email: input.email.trim().toLowerCase(),
      username: input.username,
      passwordHash: await argon2.hash(input.password, {
        type: argon2.argon2id,
      }),
    });

    return this.createSession(user);
  }

  async login(email: string, password: string): Promise<SessionResult> {
    const user = await this.usersService.findByEmailWithPassword(
      email.trim().toLowerCase(),
    );
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createSession(user);
  }

  async refresh(refreshToken: string | undefined): Promise<SessionResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid session');
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !(await argon2.verify(session.tokenHash, refreshToken))
    ) {
      throw new UnauthorizedException('Invalid session');
    }

    const revoked = await this.prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) {
      throw new UnauthorizedException('Invalid session');
    }

    return this.createSession(session.user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.refreshSession.updateMany({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Logout remains idempotent even when the cookie is stale or malformed.
    }
  }

  private async createSession(user: PublicUser): Promise<SessionResult> {
    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    const sessionId = randomUUID();
    const refreshDays = this.configService.getOrThrow<number>(
      'JWT_REFRESH_TTL_DAYS',
    );
    const expiresAt = new Date(Date.now() + refreshDays * 86_400_000);

    const accessPayload: AccessTokenPayload = {
      sub: publicUser.id,
      email: publicUser.email,
      username: publicUser.username,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: publicUser.id,
      sid: sessionId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.getOrThrow<number>(
          'JWT_ACCESS_TTL_SECONDS',
        ),
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshDays * 86_400,
      }),
    ]);

    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: publicUser.id,
        tokenHash: await argon2.hash(refreshToken, { type: argon2.argon2id }),
        expiresAt,
      },
    });

    return { accessToken, refreshToken, user: publicUser };
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
      if (payload.type !== 'refresh' || !payload.sub || !payload.sid) {
        throw new Error('Invalid refresh payload');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
  }
}
