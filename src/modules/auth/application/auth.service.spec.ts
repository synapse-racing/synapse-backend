import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { UsersService } from '../../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('rejects an unknown email with a generic error', async () => {
    const usersService = {
      findByEmailWithPassword: jest.fn().mockResolvedValue(null),
    };
    const service = new AuthService(
      {} as ConfigService,
      {} as JwtService,
      {} as PrismaService,
      usersService as unknown as UsersService,
    );

    await expect(
      service.login('missing@example.com', 'irrelevant-password'),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    expect(usersService.findByEmailWithPassword).toHaveBeenCalledWith(
      'missing@example.com',
    );
  });
});
