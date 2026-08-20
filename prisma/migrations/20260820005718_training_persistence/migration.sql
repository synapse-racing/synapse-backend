-- CreateEnum
CREATE TYPE "public"."TrainingStatus" AS ENUM ('PAUSED', 'RUNNING', 'COMPLETED');

-- CreateTable
CREATE TABLE "public"."TrainingRun" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "status" "public"."TrainingStatus" NOT NULL DEFAULT 'PAUSED',
    "seed" INTEGER NOT NULL,
    "currentGeneration" INTEGER NOT NULL DEFAULT 0,
    "bestFitness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "bestGenome" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrainingCheckpoint" (
    "id" UUID NOT NULL,
    "trainingRunId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GenerationMetric" (
    "id" UUID NOT NULL,
    "trainingRunId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "bestFitness" DOUBLE PRECISION NOT NULL,
    "averageFitness" DOUBLE PRECISION NOT NULL,
    "speciesCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingRun_userId_updatedAt_idx" ON "public"."TrainingRun"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCheckpoint_trainingRunId_generation_key" ON "public"."TrainingCheckpoint"("trainingRunId", "generation");

-- CreateIndex
CREATE INDEX "GenerationMetric_trainingRunId_generation_idx" ON "public"."GenerationMetric"("trainingRunId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationMetric_trainingRunId_generation_key" ON "public"."GenerationMetric"("trainingRunId", "generation");

-- AddForeignKey
ALTER TABLE "public"."TrainingRun" ADD CONSTRAINT "TrainingRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingCheckpoint" ADD CONSTRAINT "TrainingCheckpoint_trainingRunId_fkey" FOREIGN KEY ("trainingRunId") REFERENCES "public"."TrainingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GenerationMetric" ADD CONSTRAINT "GenerationMetric_trainingRunId_fkey" FOREIGN KEY ("trainingRunId") REFERENCES "public"."TrainingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
