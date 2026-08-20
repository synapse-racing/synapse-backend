# Synapse Racing - Backend

API NestJS para autenticacion, persistencia de entrenamientos NEAT y carreras multijugador.

## Requisitos

- Node.js 24 o superior.
- Corepack habilitado.
- Docker Desktop o una instancia PostgreSQL compatible.

## Instalacion

```bash
corepack enable
pnpm install
```

Copia `.env.example` como `.env`. Los valores incluidos sirven para desarrollo local y no deben utilizarse como secretos de produccion.

## Base de datos

```bash
docker compose up -d
pnpm prisma:generate
```

Para aplicar las migraciones versionadas existentes:

```bash
pnpm db:deploy
```

Usa `pnpm db:migrate` unicamente al crear una nueva migracion durante el desarrollo.

## Ejecucion

```bash
pnpm start:dev
```

- API: `http://localhost:3000/api`
- Health check: `http://localhost:3000/api/health`
- Swagger: `http://localhost:3000/api/docs`
- Liveness: `http://localhost:3000/api/health/live`
- Readiness: `http://localhost:3000/api/health/ready`

Swagger se deshabilita cuando `NODE_ENV=production`.

## Autenticacion

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
```

El access token se envia como Bearer JWT. El refresh token es rotatorio y se almacena en una cookie `HttpOnly`; la base de datos conserva exclusivamente su hash Argon2id.

## Entrenamientos

```text
POST   /api/training-runs
GET    /api/training-runs
GET    /api/training-runs/:id
PATCH  /api/training-runs/:id/status
DELETE /api/training-runs/:id
POST   /api/training-runs/:id/checkpoints
GET    /api/training-runs/:id/checkpoints/latest
GET    /api/training-runs/:id/metrics
GET    /api/training-runs/:id/best-genome
```

Todos los endpoints requieren Bearer JWT y filtran los recursos por el usuario autenticado. Checkpoint, metrica y resumen se actualizan dentro de una transaccion Prisma.

## Multijugador

Socket.IO utiliza el namespace `/multiplayer`. El access token se envia en `auth.token` durante el handshake.

```text
room:create
room:join
room:leave
player:ready
race:start
race:input
```

El servidor ejecuta la simulacion autoritativa a 20 Hz y publica `race:snapshot` a 10 Hz. Las salas son efimeras y viven en memoria durante esta version.

## Verificaciones

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

## Estructura inicial

```text
src/
  config/          # Validacion de variables de entorno
  infrastructure/  # Prisma y adaptadores externos
  modules/          # Auth, usuarios y futuros dominios
  app.setup.ts     # Configuracion HTTP compartida
```

Las funcionalidades se agregaran como modulos bajo `src/modules` conforme avance cada especificacion.

## Produccion

Consulta [DEPLOYMENT.md](./DEPLOYMENT.md) para desplegar con Docker Compose, ejecutar migraciones, terminar TLS y gestionar backups.
