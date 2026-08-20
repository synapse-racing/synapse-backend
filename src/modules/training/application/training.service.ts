import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TrainingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CreateTrainingRunDto } from '../presentation/dto/create-training-run.dto';
import { SaveCheckpointDto } from '../presentation/dto/save-checkpoint.dto';

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

  async delete(userId: string, id: string): Promise<void> {
    const result = await this.prisma.trainingRun.deleteMany({
      where: { id, userId },
    });
    if (result.count !== 1)
      throw new NotFoundException('Training run not found');
  }

  async saveCheckpoint(userId: string, id: string, input: SaveCheckpointDto) {
    if (input.snapshot.version !== 1) {
      throw new BadRequestException('Unsupported snapshot version');
    }

    return this.prisma.$transaction(async (transaction) => {
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
      select: { name: true, bestGenome: true },
    });
    if (!trainingRun?.bestGenome) {
      throw new NotFoundException('Saved genome is not available');
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
