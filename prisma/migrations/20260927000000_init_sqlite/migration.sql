-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrainingRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAUSED',
    "seed" INTEGER NOT NULL,
    "currentGeneration" INTEGER NOT NULL DEFAULT 0,
    "bestFitness" REAL NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "bestGenome" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "TrainingRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingRunId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingCheckpoint_trainingRunId_fkey" FOREIGN KEY ("trainingRunId") REFERENCES "TrainingRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingRunId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "bestFitness" REAL NOT NULL,
    "averageFitness" REAL NOT NULL,
    "speciesCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationMetric_trainingRunId_fkey" FOREIGN KEY ("trainingRunId") REFERENCES "TrainingRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "TrainingRun_userId_updatedAt_idx" ON "TrainingRun"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCheckpoint_trainingRunId_generation_key" ON "TrainingCheckpoint"("trainingRunId", "generation");

-- CreateIndex
CREATE INDEX "GenerationMetric_trainingRunId_generation_idx" ON "GenerationMetric"("trainingRunId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationMetric_trainingRunId_generation_key" ON "GenerationMetric"("trainingRunId", "generation");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");
