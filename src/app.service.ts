import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './infrastructure/database/prisma.service';

export interface HealthStatus {
  status: 'ok';
  service: 'synapse-backend';
  environment: string;
}

export interface ReadinessStatus extends HealthStatus {
  dependencies: {
    database: 'up';
  };
}

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'synapse-backend',
      environment: this.configService.getOrThrow<string>('NODE_ENV'),
    };
  }

  async getReadiness(): Promise<ReadinessStatus> {
    try {
      const hello = await this.prisma.$runCommandRaw({ hello: 1 });
      if (
        typeof hello.setName !== 'string' ||
        hello.isWritablePrimary !== true
      ) {
        throw new Error('MongoDB must be a writable replica set member');
      }
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }

    return {
      ...this.getHealth(),
      dependencies: { database: 'up' },
    };
  }
}
