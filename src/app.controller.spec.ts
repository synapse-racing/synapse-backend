import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './infrastructure/database/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let queryDatabase: jest.Mock;

  beforeEach(async () => {
    queryDatabase = jest
      .fn()
      .mockResolvedValue({ ok: 1, setName: 'rs0', isWritablePrimary: true });
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test' },
        },
        {
          provide: PrismaService,
          useValue: {
            $runCommandRaw: queryDatabase,
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return the service status', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'synapse-backend',
        environment: 'test',
      });
    });

    it('should report database readiness', async () => {
      await expect(appController.getReadiness()).resolves.toEqual({
        status: 'ok',
        service: 'synapse-backend',
        environment: 'test',
        dependencies: { database: 'up' },
      });
    });

    it('should reject a standalone server that cannot run transactions', async () => {
      queryDatabase.mockResolvedValueOnce({ ok: 1, isWritablePrimary: true });
      await expect(appController.getReadiness()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('should reject readiness when the database is unavailable', async () => {
      queryDatabase.mockRejectedValueOnce(new Error('connection refused'));

      await expect(appController.getReadiness()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
