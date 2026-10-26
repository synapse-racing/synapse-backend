import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/infrastructure/database/prisma.service';
import { io, type Socket } from 'socket.io-client';
import {
  defaultAppearance,
  type AppearanceProfile,
  type VehicleAppearance,
} from '../src/modules/garage/domain/vehicle-appearance';
import { TrainingService } from '../src/modules/training/application/training.service';

interface AuthBody {
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
}

const autonomousGenome = {
  id: 'autonomous-pilot',
  nodes: [
    ...Array.from({ length: 6 }, (_, id) => ({ id, type: 'input', layer: 0 })),
    { id: 6, type: 'bias', layer: 0 },
    { id: 7, type: 'output', layer: 1 },
    { id: 8, type: 'output', layer: 1 },
  ],
  connections: [
    {
      innovation: 1,
      source: 6,
      target: 8,
      weight: 2,
      enabled: true,
    },
  ],
};

interface ErrorBody {
  message: string;
}

interface TrainingRunBody {
  id: string;
  name: string;
  currentGeneration: number;
  bestFitness: number;
}

describe('AppController (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.trainingCheckpoint.deleteMany();
    await prisma.generationMetric.deleteMany();
    await prisma.trainingRun.deleteMany();
    await prisma.refreshSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200).expect({
      status: 'ok',
      service: 'synapse-backend',
      environment: 'test',
    });
  });

  it('/api/health/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect((response) => {
        expect(
          (response.body as { dependencies: { database: string } }).dependencies
            .database,
        ).toBe('up');
      });
  });

  it('validates and persists private vehicle appearance profiles', async () => {
    const server = app.getHttpServer();
    const first = await request(server)
      .post('/api/auth/register')
      .send({
        email: 'garage@example.com',
        username: 'garage_driver',
        password: 'secure-pass-123',
      })
      .expect(201);
    const second = await request(server)
      .post('/api/auth/register')
      .send({
        email: 'garage-other@example.com',
        username: 'garage_other',
        password: 'secure-pass-123',
      })
      .expect(201);
    const account = first.body as AuthBody;
    const token = 'Bearer ' + account.accessToken;
    const route = '/api/users/me/appearance';
    await request(server).get(route).expect(401);
    await request(server).patch(route).send(defaultAppearance).expect(401);
    await request(server)
      .get(route)
      .set('Authorization', token)
      .expect(200)
      .expect({ appearance: defaultAppearance, customized: false });
    await prisma.user.update({
      where: { id: account.user.id },
      data: { appearance: { modelId: 'retired-model' } },
    });
    await request(server)
      .get(route)
      .set('Authorization', token)
      .expect(200)
      .expect({ appearance: defaultAppearance, customized: false });
    const custom: VehicleAppearance = {
      ...defaultAppearance,
      modelId: 'prototype',
      primaryColor: '#AABBCC',
      rimColor: '#222222',
      livery: 'stripe',
      finish: 'metallic',
      number: 23,
    };
    for (const input of [
      { ...custom, modelId: 'https://external.test/car.glb' },
      { ...custom, primaryColor: 'red' },
      { ...custom, finish: 'chrome' },
      { ...custom, number: 100 },
      { ...custom, number: 1.5 },
      { ...custom, userId: (second.body as AuthBody).user.id },
      { modelId: 'formula' },
    ])
      await request(server)
        .patch(route)
        .set('Authorization', token)
        .send(input)
        .expect(400);
    const saved = await request(server)
      .patch(route)
      .set('Authorization', token)
      .send(custom)
      .expect(200);
    const expected = { ...custom, primaryColor: '#aabbcc' };
    expect((saved.body as AppearanceProfile).appearance).toEqual(expected);
    await request(server)
      .get(route)
      .set('Authorization', token)
      .expect(200)
      .expect({ appearance: expected, customized: true });
    await request(server)
      .get(route)
      .set('Authorization', 'Bearer ' + (second.body as AuthBody).accessToken)
      .expect(200)
      .expect({ appearance: defaultAppearance, customized: false });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } }))
        .appearance,
    ).toEqual(expected);
  });

  it('registers, authenticates, rotates and revokes a session', async () => {
    const server = app.getHttpServer();
    const credentials = {
      email: 'Driver@Example.com',
      username: 'driver_one',
      password: 'secure-pass-123',
    };

    const registration = await request(server)
      .post('/api/auth/register')
      .send(credentials)
      .expect(201);
    const registrationBody = registration.body as AuthBody;

    expect(registrationBody.user).toMatchObject({
      email: 'driver@example.com',
      username: 'driver_one',
    });
    expect(registrationBody.user).not.toHaveProperty('passwordHash');
    expect(registrationBody.accessToken).toEqual(expect.any(String));

    const registrationCookies = registration.headers['set-cookie'] as string[];
    expect(registrationCookies[0]).toContain('HttpOnly');
    expect(registrationCookies[0]).toContain('SameSite=Lax');
    const originalCookie = registrationCookies[0].split(';')[0];

    await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registrationBody.accessToken}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as AuthBody['user'];
        expect(body.email).toBe('driver@example.com');
        expect(body).not.toHaveProperty('passwordHash');
      });

    const refresh = await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(200);
    const rotatedCookie = (refresh.headers['set-cookie'] as string[])[0].split(
      ';',
    )[0];

    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(401);

    await request(server)
      .post('/api/auth/logout')
      .set('Cookie', rotatedCookie)
      .expect(204);

    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });

  it('rejects duplicate accounts and invalid credentials', async () => {
    const server = app.getHttpServer();
    const credentials = {
      email: 'driver@example.com',
      username: 'driver_one',
      password: 'secure-pass-123',
    };

    await request(server)
      .post('/api/auth/register')
      .send(credentials)
      .expect(201);
    await request(server)
      .post('/api/auth/register')
      .send(credentials)
      .expect(409);
    await request(server)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    await request(server)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'incorrect-password' })
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorBody;
        expect(body.message).toBe('Invalid credentials');
      });
  });

  it('allows concurrent logins and refresh without revoking other sessions', async () => {
    const server = app.getHttpServer();
    const credentials = {
      email: 'single@example.com',
      username: 'single_driver',
      password: 'secure-pass-123',
    };
    const registration = await request(server)
      .post('/api/auth/register')
      .send(credentials)
      .expect(201);
    const cookie = (registration.headers['set-cookie'] as string[])[0].split(
      ';',
    )[0];
    const [refresh] = await Promise.all([
      request(server)
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(200),
      request(server)
        .post('/api/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200),
    ]);
    const rotated = (refresh.headers['set-cookie'] as string[])[0].split(
      ';',
    )[0];
    await request(server)
      .post('/api/auth/logout')
      .set('Cookie', rotated)
      .expect(204);
    const attempts = await Promise.all([
      request(server)
        .post('/api/auth/login')
        .send({ email: credentials.email, password: credentials.password }),
      request(server)
        .post('/api/auth/login')
        .send({ email: credentials.email, password: credentials.password }),
    ]);
    expect(attempts.map((response) => response.status).sort()).toEqual([
      200, 200,
    ]);
    expect(
      await prisma.refreshSession.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ).toBe(3);
  });

  it('isolates sessions and login limits for different accounts on the same IP', async () => {
    const server = app.getHttpServer();
    const firstBrowser = request.agent(server);
    const secondBrowser = request.agent(server);
    const thirdBrowser = request.agent(server);
    const first = {
      email: 'first@example.com',
      username: 'first_driver',
      password: 'secure-pass-123',
    };
    const second = {
      email: 'second@example.com',
      username: 'second_driver',
      password: 'secure-pass-123',
    };
    await firstBrowser.post('/api/auth/register').send(first).expect(201);
    await secondBrowser.post('/api/auth/register').send(second).expect(201);
    await firstBrowser.post('/api/auth/logout').expect(204);
    await secondBrowser.post('/api/auth/logout').expect(204);
    const [firstLogin, secondLogin] = await Promise.all([
      firstBrowser
        .post('/api/auth/login')
        .send({ email: first.email, password: first.password })
        .expect(200),
      secondBrowser
        .post('/api/auth/login')
        .send({ email: second.email, password: second.password })
        .expect(200),
    ]);
    expect((firstLogin.body as AuthBody).user.id).not.toBe(
      (secondLogin.body as AuthBody).user.id,
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      await thirdBrowser
        .post('/api/auth/login')
        .send({ email: 'FIRST@EXAMPLE.COM', password: 'wrong-password' })
        .expect(401);
    }
    await thirdBrowser
      .post('/api/auth/login')
      .send({ email: first.email, password: first.password })
      .expect(429);
    await firstBrowser.post('/api/auth/refresh').expect(200);
    await secondBrowser.post('/api/auth/refresh').expect(200);
    await secondBrowser.post('/api/auth/logout').expect(204);
    await thirdBrowser
      .post('/api/auth/login')
      .send({ email: second.email, password: second.password })
      .expect(200);
    await firstBrowser.post('/api/auth/refresh').expect(200);
    expect(
      await prisma.refreshSession.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ).toBe(2);
  });

  it('allows login after the previous session expires', async () => {
    const server = app.getHttpServer();
    const credentials = {
      email: 'expired@example.com',
      username: 'expired_driver',
      password: 'secure-pass-123',
    };
    await request(server)
      .post('/api/auth/register')
      .send(credentials)
      .expect(201);
    await prisma.refreshSession.updateMany({
      data: { expiresAt: new Date(0) },
    });
    await request(server)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
  });

  it('validates registration input and protects the current user', async () => {
    const server = app.getHttpServer();

    await request(server)
      .post('/api/auth/register')
      .send({
        email: 'not-an-email',
        username: 'invalid username',
        password: 'short',
      })
      .expect(400);

    await request(server).get('/api/auth/me').expect(401);
  });

  it('persists owned training checkpoints and hides them from other users', async () => {
    const server = app.getHttpServer();
    const ownerRegistration = await request(server)
      .post('/api/auth/register')
      .send({
        email: 'owner@example.com',
        username: 'owner_driver',
        password: 'secure-pass-123',
      })
      .expect(201);
    const ownerToken = (ownerRegistration.body as AuthBody).accessToken;

    const creation = await request(server)
      .post('/api/training-runs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'First evolution',
        seed: 42170,
        config: { populationSize: 24 },
      })
      .expect(201);
    const trainingRun = creation.body as TrainingRunBody;

    await request(server)
      .post(`/api/training-runs/${trainingRun.id}/checkpoints`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        generation: 1,
        snapshot: { version: 1, generation: 1, genomes: [] },
        bestGenome: { id: 'genome-24', nodes: [], connections: [] },
        bestFitness: 1250,
        averageFitness: 420,
        speciesCount: 2,
        durationMs: 18000,
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as TrainingRunBody;
        expect(body.currentGeneration).toBe(1);
        expect(body.bestFitness).toBe(1250);
      });

    await request(server)
      .get(`/api/training-runs/${trainingRun.id}/checkpoints/latest`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => {
        expect(
          (response.body as { snapshot: { version: number } }).snapshot.version,
        ).toBe(1);
      });

    await request(server)
      .get(`/api/training-runs/${trainingRun.id}/metrics`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body as unknown[]).toHaveLength(1);
      });

    const regeneratedTrack = { version: 'curved-loop-v1', seed: 987654 };
    await request(server)
      .patch(`/api/training-runs/${trainingRun.id}/track`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ track: regeneratedTrack })
      .expect(200)
      .expect((response) => {
        const body = response.body as TrainingRunBody & {
          config: { track: unknown };
        };
        expect(body.config.track).toEqual(regeneratedTrack);
        expect(body.bestFitness).toBe(0);
      });
    await request(server)
      .get(`/api/training-runs/${trainingRun.id}/checkpoints/latest`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          snapshot: { config: { track: unknown } };
        };
        expect(body.snapshot.config.track).toEqual(regeneratedTrack);
      });
    await request(server)
      .get(`/api/training-runs/${trainingRun.id}/metrics`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect([]);

    const otherRegistration = await request(server)
      .post('/api/auth/register')
      .send({
        email: 'other@example.com',
        username: 'other_driver',
        password: 'secure-pass-123',
      })
      .expect(201);
    const otherToken = (otherRegistration.body as AuthBody).accessToken;

    await request(server)
      .get(`/api/training-runs/${trainingRun.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    await request(server)
      .delete(`/api/training-runs/${trainingRun.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await request(server)
      .get('/api/training-runs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect([]);
  });

  it('allows only one concurrent rotation of the same refresh token', async () => {
    const server = app.getHttpServer();
    const registration = await request(server)
      .post('/api/auth/register')
      .send({
        email: 'rotation@example.com',
        username: 'rotation_driver',
        password: 'secure-pass-123',
      })
      .expect(201);
    const cookie = (registration.headers['set-cookie'] as string[])[0].split(
      ';',
    )[0];
    const results = await Promise.all([
      request(server).post('/api/auth/refresh').set('Cookie', cookie),
      request(server).post('/api/auth/refresh').set('Cookie', cookie),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    expect(
      await prisma.refreshSession.count({ where: { revokedAt: null } }),
    ).toBe(1);
  });

  it('keeps generation and best fitness when checkpoints arrive concurrently', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'checkpoint@example.com',
        username: 'checkpoint_driver',
        passwordHash: 'test-hash',
      },
    });
    const run = await prisma.trainingRun.create({
      data: {
        userId: user.id,
        name: 'Concurrent history',
        seed: 42,
        config: { populationSize: 24 },
      },
    });
    const service = app.get(TrainingService);
    const input = (generation: number, fitness: number) => ({
      generation,
      snapshot: { version: 1, generation },
      bestGenome: { id: `best-${generation}` },
      bestFitness: fitness,
      averageFitness: 5,
      speciesCount: 2,
      durationMs: 1000,
    });
    await Promise.all([
      service.saveCheckpoint(user.id, run.id, input(3, 1300)),
      service.saveCheckpoint(user.id, run.id, input(2, 900)),
    ]);
    const saved = await prisma.trainingRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(saved.currentGeneration).toBe(3);
    expect(saved.bestFitness).toBe(1300);
    expect(saved.bestGenome).toEqual({ id: 'best-3' });
    expect(
      await prisma.generationMetric.count({ where: { trainingRunId: run.id } }),
    ).toBe(2);
  });

  it('stores BSON documents and atomically removes the training history', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'mongo@example.com',
        username: 'mongo_driver',
        passwordHash: 'test-hash',
      },
    });
    const run = await prisma.trainingRun.create({
      data: {
        userId: user.id,
        name: 'Mongo history',
        seed: 42,
        config: { populationSize: 24 },
      },
    });
    await prisma.trainingCheckpoint.create({
      data: {
        trainingRunId: run.id,
        generation: 1,
        snapshot: { version: 1, genomes: [] },
      },
    });
    await prisma.generationMetric.create({
      data: {
        trainingRunId: run.id,
        generation: 1,
        bestFitness: 12.5,
        averageFitness: 5.25,
        speciesCount: 2,
        durationMs: 1000,
      },
    });
    const raw = await prisma.$runCommandRaw({
      aggregate: 'training_runs',
      pipeline: [
        { $match: { _id: run.id } },
        {
          $project: {
            _id: 1,
            idType: { $type: '$_id' },
            dateType: { $type: '$createdAt' },
            configType: { $type: '$config' },
          },
        },
      ],
      cursor: {},
    });
    expect((raw.cursor as { firstBatch: unknown[] }).firstBatch).toEqual([
      { _id: run.id, idType: 'string', dateType: 'date', configType: 'object' },
    ]);
    const service = app.get(TrainingService);
    await service.delete(user.id, run.id);
    expect(
      await prisma.trainingCheckpoint.count({
        where: { trainingRunId: run.id },
      }),
    ).toBe(0);
    expect(
      await prisma.generationMetric.count({ where: { trainingRunId: run.id } }),
    ).toBe(0);
    expect(await prisma.trainingRun.count({ where: { id: run.id } })).toBe(0);
  });

  it('authenticates a websocket and creates a private room', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'socket@example.com',
        username: 'socket_driver',
        password: 'secure-pass-123',
      })
      .expect(201);
    const token = (registration.body as AuthBody).accessToken;

    await app.listen(0, '127.0.0.1');
    const socket: Socket = io(`${await app.getUrl()}/multiplayer`, {
      auth: { token },
      transports: ['websocket'],
    });

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connection:ready', () => resolve());
        socket.once('connect_error', reject);
      });
      const roomState = new Promise<{
        code: string;
        players: Array<{ username: string }>;
      }>((resolve) => {
        socket.once('room:state', resolve);
      });
      socket.emit('room:create', { maxPlayers: 2 });

      const state = await roomState;
      expect(state.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(
        state.players.some((player) => player.username === 'socket_driver'),
      ).toBe(true);
    } finally {
      socket.disconnect();
    }
  });

  it('runs selected trained genomes in authoritative snapshots', async () => {
    const [hostRegistration, guestRegistration] = await Promise.all([
      request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'race-host@example.com',
        username: 'race_host',
        password: 'secure-pass-123',
      }),
      request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'race-guest@example.com',
        username: 'race_guest',
        password: 'secure-pass-123',
      }),
    ]);
    expect(hostRegistration.status).toBe(201);
    expect(guestRegistration.status).toBe(201);
    const hostBody = hostRegistration.body as AuthBody;
    const guestBody = guestRegistration.body as AuthBody;
    const firstAppearance: VehicleAppearance = {
      ...defaultAppearance,
      modelId: 'gt',
      number: 23,
    };
    const raceAppearance: VehicleAppearance = {
      ...firstAppearance,
      modelId: 'prototype',
      livery: 'stripe',
    };
    await request(app.getHttpServer())
      .patch('/api/users/me/appearance')
      .set('Authorization', 'Bearer ' + hostBody.accessToken)
      .send(firstAppearance)
      .expect(200);
    const [hostRun, guestRun] = await Promise.all([
      prisma.trainingRun.create({
        data: {
          userId: hostBody.user.id,
          name: 'Host AI',
          seed: 1,
          config: {
            inputCount: 6,
            outputCount: 2,
            simulationVersion: 'race-sim-v1',
            track: { version: 'curved-loop-v1', seed: 11 },
          },
          bestGenome: autonomousGenome,
        },
      }),
      prisma.trainingRun.create({
        data: {
          userId: guestBody.user.id,
          name: 'Guest AI',
          seed: 2,
          config: {
            inputCount: 6,
            outputCount: 2,
            simulationVersion: 'race-sim-v1',
            track: { version: 'curved-loop-v1', seed: 22 },
          },
          bestGenome: autonomousGenome,
        },
      }),
    ]);

    await app.listen(0, '127.0.0.1');
    const host: Socket = io(`${await app.getUrl()}/multiplayer`, {
      auth: { token: (hostRegistration.body as AuthBody).accessToken },
      transports: ['websocket'],
    });
    const guest: Socket = io(`${await app.getUrl()}/multiplayer`, {
      auth: { token: (guestRegistration.body as AuthBody).accessToken },
      transports: ['websocket'],
    });

    try {
      await Promise.all(
        [host, guest].map(
          (socket) =>
            new Promise<void>((resolve, reject) => {
              socket.once('connection:ready', () => resolve());
              socket.once('connect_error', reject);
            }),
        ),
      );

      const createdRoom = new Promise<{
        code: string;
        players: Array<{ appearance: VehicleAppearance }>;
      }>((resolve) => {
        host.once('room:state', resolve);
      });
      host.emit('room:create', { maxPlayers: 2 });
      const created = await createdRoom;
      const { code } = created;
      expect(created.players[0].appearance).toEqual(firstAppearance);
      await request(app.getHttpServer())
        .patch('/api/users/me/appearance')
        .set('Authorization', 'Bearer ' + hostBody.accessToken)
        .send(raceAppearance)
        .expect(200);

      const joinedRoom = new Promise<void>((resolve) => {
        guest.once('room:state', () => resolve());
      });
      guest.emit('room:join', { code });
      await joinedRoom;

      const selectedTrack = new Promise<void>((resolve) => {
        host.once('room:state', (state: { track: { seed: number } }) => {
          expect(state.track.seed).toBe(777);
          resolve();
        });
      });
      host.emit('room:select-track', {
        track: { version: 'curved-loop-v1', seed: 777 },
      });
      await selectedTrack;

      const bothSelected = new Promise<void>((resolve) => {
        host.on(
          'room:state',
          (state: { players: Array<{ genomeName: string | null }> }) => {
            if (state.players.every((player) => player.genomeName)) resolve();
          },
        );
      });
      host.emit('player:select-genome', { trainingRunId: hostRun.id });
      guest.emit('player:select-genome', { trainingRunId: guestRun.id });
      await bothSelected;

      const bothReady = new Promise<void>((resolve) => {
        host.on(
          'room:state',
          (state: { players: Array<{ ready: boolean }> }) => {
            if (
              state.players.length === 2 &&
              state.players.every((player) => player.ready)
            ) {
              resolve();
            }
          },
        );
      });
      host.emit('player:ready', { ready: true });
      guest.emit('player:ready', { ready: true });
      await bothReady;

      const raceStarted = Promise.all(
        [host, guest].map(
          (socket) =>
            new Promise<void>((resolve) => {
              socket.once('race:start', () => resolve());
            }),
        ),
      );
      host.emit('race:start');
      await raceStarted;

      const movingSnapshot = new Promise<{
        status: string;
        startAt: number;
        players: Array<{
          userId: string;
          speed: number;
          z: number;
          appearance: VehicleAppearance;
        }>;
      }>((resolve) => {
        host.on(
          'race:snapshot',
          (snapshot: {
            status: string;
            startAt: number;
            players: Array<{
              userId: string;
              speed: number;
              z: number;
              appearance: VehicleAppearance;
            }>;
          }) => {
            if (
              snapshot.status === 'RACING' &&
              snapshot.players.every((player) => player.speed > 0)
            ) {
              resolve(snapshot);
            }
          },
        );
      });
      const snapshot = await movingSnapshot;
      expect(snapshot.players.every((player) => player.z < 13)).toBe(true);
      expect(
        snapshot.players.find((p) => p.userId === hostBody.user.id)?.appearance,
      ).toEqual(raceAppearance);
      expect(
        snapshot.players.find((p) => p.userId === guestBody.user.id)
          ?.appearance,
      ).toEqual(defaultAppearance);
      await request(app.getHttpServer())
        .patch('/api/users/me/appearance')
        .set('Authorization', 'Bearer ' + hostBody.accessToken)
        .send(firstAppearance)
        .expect(200);
      const frozen = await new Promise<{
        players: Array<{ userId: string; appearance: VehicleAppearance }>;
      }>((resolve) => host.once('race:snapshot', resolve));
      expect(
        frozen.players.find((p) => p.userId === hostBody.user.id)?.appearance,
      ).toEqual(raceAppearance);
      const denied = new Promise<{ code: string }>((resolve) =>
        guest.once('server:error', resolve),
      );
      guest.emit('race:eliminate', {
        userId: hostBody.user.id,
        startAt: snapshot.startAt,
      });
      expect((await denied).code).toBe('HOST_REQUIRED');
      const eliminated = Promise.all(
        [host, guest].map(
          (socket) =>
            new Promise<void>((resolve) => {
              socket.on(
                'race:snapshot',
                (state: {
                  players: Array<{
                    userId: string;
                    eliminated: boolean;
                    eliminationReason: string | null;
                  }>;
                }) => {
                  if (
                    state.players.some(
                      (player) =>
                        player.userId === guestBody.user.id &&
                        player.eliminated &&
                        player.eliminationReason === 'HOST',
                    )
                  )
                    resolve();
                },
              );
            }),
        ),
      );
      host.emit('race:eliminate', {
        userId: guestBody.user.id,
        startAt: snapshot.startAt,
      });
      await eliminated;
      const finished = new Promise<{
        players: Array<{ userId: string; eliminationReason: string | null }>;
      }>((resolve) => host.once('race:finish', resolve));
      const returned = new Promise<void>((resolve) =>
        host.on(
          'room:state',
          (state: { status: string; players: unknown[] }) => {
            if (state.status === 'LOBBY' && state.players.length === 2)
              resolve();
          },
        ),
      );
      host.emit('race:eliminate', {
        userId: hostBody.user.id,
        startAt: snapshot.startAt,
      });
      expect(
        (await finished).players.every(
          (player) => player.eliminationReason === 'HOST',
        ),
      ).toBe(true);
      await returned;
    } finally {
      host.disconnect();
      guest.disconnect();
    }
  }, 15_000);

  it('imports guest progress once per account, including concurrent retries', async () => {
    const server = app.getHttpServer();
    const first = await request(server)
      .post('/api/auth/register')
      .send({
        email: 'import@example.com',
        username: 'import_driver',
        password: 'secure-pass-123',
      })
      .expect(201);
    const second = await request(server)
      .post('/api/auth/register')
      .send({
        email: 'import-other@example.com',
        username: 'import_other',
        password: 'secure-pass-123',
      })
      .expect(201);
    const token = (first.body as AuthBody).accessToken;
    const otherToken = (second.body as AuthBody).accessToken;
    const config = {
      populationSize: 1,
      inputCount: 6,
      outputCount: 2,
      simulationVersion: 'race-sim-v1',
      track: { version: 'grand-prix-v3', seed: 42 },
    };
    const input = {
      sourceId: '62ab591f-6c11-4fa9-bbf2-410a973ad331',
      name: 'Guest progress',
      seed: 42,
      config,
      generation: 1,
      snapshot: {
        version: 1,
        seed: 42,
        generation: 1,
        config,
        genomes: [autonomousGenome],
      },
      bestGenome: autonomousGenome,
      bestFitness: 100,
      metrics: [
        {
          generation: 1,
          bestFitness: 100,
          averageFitness: 50,
          speciesCount: 1,
          durationMs: 2000,
        },
      ],
    };
    await request(server)
      .post('/api/training-runs/import-guest')
      .send(input)
      .expect(401);
    const attempts = await Promise.all(
      [0, 1].map(() =>
        request(server)
          .post('/api/training-runs/import-guest')
          .set('Authorization', 'Bearer ' + token)
          .send(input),
      ),
    );
    expect(attempts.map((r) => r.status)).toEqual([201, 201]);
    const run = attempts[0].body as TrainingRunBody;
    expect((attempts[1].body as TrainingRunBody).id).toBe(run.id);
    expect(run.currentGeneration).toBe(1);
    expect(await prisma.trainingRun.count()).toBe(1);
    expect(await prisma.generationMetric.count()).toBe(1);
    expect(await prisma.trainingCheckpoint.count()).toBe(1);
    await request(server)
      .get('/api/training-runs/' + run.id + '/checkpoints/latest')
      .set('Authorization', 'Bearer ' + token)
      .expect(200)
      .expect((r) => {
        expect((r.body as { snapshot: unknown }).snapshot).toEqual(
          input.snapshot,
        );
      });
    await request(server)
      .post('/api/training-runs/import-guest')
      .set('Authorization', 'Bearer ' + token)
      .send(input)
      .expect(201);
    await request(server)
      .get('/api/training-runs/' + run.id)
      .set('Authorization', 'Bearer ' + otherToken)
      .expect(404);
    const other = await request(server)
      .post('/api/training-runs/import-guest')
      .set('Authorization', 'Bearer ' + otherToken)
      .send(input)
      .expect(201);
    expect((other.body as TrainingRunBody).id).not.toBe(run.id);
    await request(server)
      .post('/api/training-runs/import-guest')
      .set('Authorization', 'Bearer ' + token)
      .send({ ...input, metrics: [...input.metrics, ...input.metrics] })
      .expect(400);
    expect(await prisma.trainingRun.count()).toBe(2);
  });

  afterEach(async () => {
    await app.close();
  });
});
