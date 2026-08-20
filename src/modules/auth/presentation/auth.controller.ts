import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '../application/auth.service';
import { AuthResponse, SessionResult } from '../domain/auth.types';
import { AccessTokenGuard } from '../infrastructure/access-token.guard';
import type { PublicUser } from '../../users/users.service';
import { CurrentUser } from './current-user.decorator';
import { AuthResponseDto, UserResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const refreshCookieName = 'synapse_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiCreatedResponse({ description: 'Account created', type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email or username already exists' })
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(
      await this.authService.register(input),
      response,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start a session with email and password' })
  @ApiOkResponse({ description: 'Authenticated', type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(
      await this.authService.login(input.email, input.password),
      response,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and renew the session' })
  @ApiOkResponse({ description: 'Session renewed', type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid session' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(
      await this.authService.refresh(this.readRefreshCookie(request)),
      response,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.readRefreshCookie(request));
    response.clearCookie(refreshCookieName, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiOkResponse({ description: 'Current user', type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }

  private respondWithSession(
    session: SessionResult,
    response: Response,
  ): AuthResponse {
    response.cookie(
      refreshCookieName,
      session.refreshToken,
      this.cookieOptions(),
    );
    return { accessToken: session.accessToken, user: session.user };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[refreshCookieName];
  }

  private cookieOptions() {
    const refreshDays = this.configService.getOrThrow<number>(
      'JWT_REFRESH_TTL_DAYS',
    );
    return {
      httpOnly: true,
      maxAge: refreshDays * 86_400_000,
      path: '/api/auth',
      sameSite: 'lax' as const,
      secure:
        this.configService.getOrThrow<string>('NODE_ENV') === 'production',
    };
  }
}
