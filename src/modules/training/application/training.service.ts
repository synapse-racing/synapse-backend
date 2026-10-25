import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ImportGuestTrainingDto } from '../presentation/dto/import-guest-training.dto';
import { Prisma, TrainingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CreateTrainingRunDto } from '../presentation/dto/create-training-run.dto';
import { SaveCheckpointDto } from '../presentation/dto/save-checkpoint.dto';
import { parseTrackRecipe } from '../../multiplayer/domain/track';
import type { TrackRecipe } from '../../multiplayer/domain/track';

const trainingSummarySelect = {
  id: true,
  name: true,
  status: true,
  seed: true,
  currentGeneration: true,
  bestFitness: true,
  config: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  finishedAt: true,
} satisfies Prisma.TrainingRunSelect;

@Injectable()
export class TrainingService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, input: CreateTrainingRunDto) {
    return this.prisma.trainingRun.create({
      data: {
        userId,
        name: input.name.trim(),
        seed: input.seed,
        config: input.config as Prisma.InputJsonValue,
      },
      select: trainingSummarySelect,
    });
  }

  async importGuest(userId: string, input: ImportGuestTrainingDto) {
    if (
      input.snapshot.version !== 1 ||
      input.snapshot.generation !== input.generation ||
      input.snapshot.seed !== input.seed ||
      !Array.isArray(input.snapshot.genomes) ||
      !input.snapshot.genomes.length ||
      !isDeepStrictEqual(input.snapshot.config, input.config) ||
      input.snapshot.genomes.length !== input.config.populationSize
    ) {
      throw new BadRequestException('Invalid guest training snapshot');
    }
    if (
      new Set(input.metrics.map((m) => m.generation)).size !==
        input.metrics.length ||
      input.metrics.some((m) => m.generation > input.generation)
    ) {
      throw new BadRequestException('Invalid guest generation metrics');
    }
    parseTrackRecipe(input.config.track);
    const hash = createHash('sha256')
      .update(JSON.stringify([userId, input.sourceId]))
      .digest('hex');
    const id =
      hash.slice(0, 8) +
      '-' +
      hash.slice(8, 12) +
      '-4' +
      hash.slice(13, 16) +
      '-a' +
      hash.slice(17, 20) +
      '-' +
      hash.slice(20, 32);
    try {
      return await this.prisma.transaction(async (tx) => {
        const existing = await tx.trainingRun.findFirst({
          where: { id, userId },
          select: trainingSummarySelect,
        });
        if (existing) return existing;
        const run = await tx.trainingRun.create({
          data: {
            id,
            userId,
            name: input.name.trim(),
            seed: input.seed,
            config: input.config as Prisma.InputJsonValue,
            currentGeneration: input.generation,
            bestFitness: input.bestFitness,
            ...(input.bestGenome
              ? { bestGenome: input.bestGenome as Prisma.InputJsonValue }
              : {}),
          },
          select: trainingSummarySelect,
        });
        await tx.trainingCheckpoint.create({
          data: {
            trainingRunId: id,
            generation: input.generation,
            snapshot: input.snapshot as Prisma.InputJsonValue,
          },
        });
        if (input.metrics.length)
          await tx.generationMetric.createMany({
            data: input.metrics.map((m) => ({ ...m, trainingRunId: id })),
          });
        return run;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const imported = await this.prisma.trainingRun.findFirst({
          where: { id, userId },
          select: trainingSummarySelect,
        });
        if (imported) return imported;
      }
      throw error;
    }
  }

  list(userId: string) {
    return this.prisma.trainingRun.findMany({
      where: { userId },
      select: trainingSummarySelect,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const trainingRun = await this.prisma.trainingRun.findFirst({
      where: { id, userId },
      select: trainingSummarySelect,
    });
    if (!trainingRun) throw new NotFoundException('Training run not found');
    return trainingRun;
  }

  async updateStatus(userId: string, id: string, status: TrainingStatus) {
    const trainingRun = await this.requireOwned(userId, id);
    const now = new Date();
    return this.prisma.trainingRun.update({
      where: { id: trainingRun.id },
      data: {
        status,
        startedAt:
          status === TrainingStatus.RUNNING && !trainingRun.startedAt
            ? now
            : trainingRun.startedAt,
        finishedAt: status === TrainingStatus.COMPLETED ? now : null,
      },
      select: trainingSummarySelect,
    });
  }

  async updateTrack(userId: string, id: string, trackInput: TrackRecipe) {
    const track = parseTrackRecipe(trackInput);
    const trackJson = { version: track.version, seed: track.seed };
    return this.prisma.transaction(async (transaction) => {
      const trainingRun = await transaction.trainingRun.findFirst({
        where: { id, userId },
      });
      if (!trainingRun) throw new NotFoundException('Training run not found');

      const config = trainingRun.config as Record<string, unknown>;
      const checkpoint = await transaction.trainingCheckpoint.findFirst({
        where: { trainingRunId: id },
        orderBy: { generation: 'desc' },
      });
      if (checkpoint) {
        const snapshot = checkpoint.snapshot as Record<string, unknown>;
        const snapshotConfig = snapshot.config as Record<string, unknown>;
        await transaction.trainingCheckpoint.update({
          where: { id: checkpoint.id },
          data: {
            snapshot: {
              ...snapshot,
              config: { ...snapshotConfig, track: trackJson },
            },
          },
        });
      }
      await transaction.generationMetric.deleteMany({
        where: { trainingRunId: id },
      });
      return transaction.trainingRun.update({
        where: { id },
        data: {
          config: {
            ...config,
            track: trackJson,
          },
          status: TrainingStatus.PAUSED,
          bestFitness: 0,
          bestGenome: null,
        },
        select: trainingSummarySelect,
      });
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const run = await tx.trainingRun.findFirst({ where: { id, userId } });
      if (!run) throw new NotFoundException('Training run not found');
      await tx.trainingCheckpoint.deleteMany({ where: { trainingRunId: id } });
      await tx.generationMetric.deleteMany({ where: { trainingRunId: id } });
      await tx.trainingRun.delete({ where: { id } });
    });
  }

  async saveCheckpoint(userId: string, id: string, input: SaveCheckpointDto) {
    if (input.snapshot.version !== 1) {
      throw new BadRequestException('Unsupported snapshot version');
    }

    return this.prisma.transaction(async (transaction) => {
      const trainingRun = await transaction.trainingRun.findFirst({
        where: { id, userId },
      });
      if (!trainingRun) throw new NotFoundException('Training run not found');

      const snapshot = input.snapshot as Prisma.InputJsonValue;
      const bestGenome = input.bestGenome as Prisma.InputJsonValue;
      await transaction.trainingCheckpoint.upsert({
        where: {
          trainingRunId_generation: {
            trainingRunId: id,
            generation: input.generation,
          },
        },
        create: { trainingRunId: id, generation: input.generation, snapshot },
        update: { snapshot },
      });
      await transaction.generationMetric.upsert({
        where: {
          trainingRunId_generation: {
            trainingRunId: id,
            generation: input.generation,
          },
        },
        create: {
          trainingRunId: id,
          generation: input.generation,
          bestFitness: input.bestFitness,
          averageFitness: input.averageFitness,
          speciesCount: input.speciesCount,
          durationMs: input.durationMs,
        },
        update: {
          bestFitness: input.bestFitness,
          averageFitness: input.averageFitness,
          speciesCount: input.speciesCount,
          durationMs: input.durationMs,
        },
      });

      return transaction.trainingRun.update({
        where: { id },
        data: {
          currentGeneration: Math.max(
            trainingRun.currentGeneration,
            input.generation,
          ),
          bestFitness: Math.max(trainingRun.bestFitness, input.bestFitness),
          ...(input.bestFitness >= trainingRun.bestFitness
            ? { bestGenome }
            : {}),
        },
        select: trainingSummarySelect,
      });
    });
  }

  async latestCheckpoint(userId: string, id: string) {
    await this.requireOwned(userId, id);
    return this.prisma.trainingCheckpoint.findFirst({
      where: { trainingRunId: id },
      orderBy: { generation: 'desc' },
    });
  }

  async metrics(userId: string, id: string) {
    await this.requireOwned(userId, id);
    return this.prisma.generationMetric.findMany({
      where: { trainingRunId: id },
      orderBy: { generation: 'asc' },
    });
  }

  async bestGenome(userId: string, id: string) {
    const trainingRun = await this.requireOwned(userId, id);
    if (!trainingRun.bestGenome) {
      throw new NotFoundException('Best genome is not available yet');
    }
    return {
      bestFitness: trainingRun.bestFitness,
      genome: trainingRun.bestGenome,
    };
  }

  async raceGenome(userId: string, id: string) {
    const trainingRun = await this.prisma.trainingRun.findFirst({
      where: { id, userId },
      select: { name: true, bestGenome: true, config: true },
    });
    if (!trainingRun?.bestGenome) {
      throw new NotFoundException('Saved genome is not available');
    }
    const config = trainingRun.config as Record<string, unknown>;
    if (config.simulationVersion !== 'race-sim-v1') {
      throw new BadRequestException('Training uses an incompatible simulation');
    }
    return trainingRun;
  }

  private async requireOwned(userId: string, id: string) {
    const trainingRun = await this.prisma.trainingRun.findFirst({
      where: { id, userId },
    });
    if (!trainingRun) throw new NotFoundException('Training run not found');
    return trainingRun;
  }
}
