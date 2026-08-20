import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { AccessTokenPayload } from '../domain/auth.types';
import { AuthenticatedRequest } from '../presentation/authenticated-request';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );
      if (payload.type !== 'access' || !payload.sub) {
        throw new Error('Invalid access payload');
      }

      const user = await this.usersService.findPublicById(payload.sub);
      if (!user) {
        throw new Error('User no longer exists');
      }

      (request as AuthenticatedRequest).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }
}
