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
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }

    return {
      ...this.getHealth(),
      dependencies: { database: 'up' },
    };
  }
}
