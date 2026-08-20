import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/infrastructure/database/prisma.service';
import { io, type Socket } from 'socket.io-client';

interface AuthBody {
  accessToken: string;
  user: {
    email: string;
    username: string;
  };
}

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
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    expect((login.body as AuthBody).accessToken).toEqual(expect.any(String));

    await request(server)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'incorrect-password' })
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorBody;
        expect(body.message).toBe('Invalid credentials');
      });
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

  afterEach(async () => {
    await app.close();
  });
});
