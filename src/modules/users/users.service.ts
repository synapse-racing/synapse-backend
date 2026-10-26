import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  defaultAppearance,
  parseAppearance,
  type AppearanceProfile,
  type VehicleAppearance,
} from '../garage/domain/vehicle-appearance';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export type PublicUser = Pick<
  User,
  'id' | 'email' | 'username' | 'createdAt' | 'updatedAt'
>;

const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    email: string;
    username: string;
    passwordHash: string;
  }): Promise<PublicUser> {
    try {
      return await this.prisma.user.create({
        data: input,
        select: publicUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email or username is already in use');
      }

      throw error;
    }
  }

  async getAppearance(id: string): Promise<AppearanceProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { appearance: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const appearance = parseAppearance(user.appearance);
    return {
      appearance: appearance ?? { ...defaultAppearance },
      customized: appearance !== null,
    };
  }

  async saveAppearance(
    id: string,
    input: VehicleAppearance,
  ): Promise<AppearanceProfile> {
    const appearance = parseAppearance(input);
    if (!appearance)
      throw new BadRequestException('Invalid vehicle appearance');
    await this.prisma.user.update({
      where: { id },
      data: { appearance: { ...appearance } },
      select: { id: true },
    });
    return { appearance, customized: true };
  }

  async getAppearances(
    ids: string[],
  ): Promise<ReadonlyMap<string, VehicleAppearance>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, appearance: true },
    });
    if (users.length !== new Set(ids).size)
      throw new NotFoundException('A player no longer exists');
    return new Map(
      users.map((user) => [
        user.id,
        parseAppearance(user.appearance) ?? { ...defaultAppearance },
      ]),
    );
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findPublicById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }
}
