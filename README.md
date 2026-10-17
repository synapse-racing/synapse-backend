# Synapse Racing - Backend

API NestJS para autenticacion, persistencia de entrenamientos NEAT y carreras multijugador.

## Requisitos

- Node.js 24 o superior.
- Corepack habilitado.
- MongoDB con replica set habilitado (tambien puede ser de un nodo). Para desarrollo local: `docker compose up -d mongo`.

## Instalacion

```bash
corepack enable
pnpm install
```

Copia `.env.example` como `.env`. Los valores incluidos sirven para desarrollo local y no deben utilizarse como secretos de produccion.

## Base de datos

```bash
pnpm prisma:generate
```

Para preparar colecciones e indices en una base nueva:

```bash
pnpm db:push
```

`DATABASE_URL` debe incluir la base y el replica set. MongoDB usa `db push`, no Prisma Migrate. `db:deploy` es un alias de `db:push` para los scripts existentes. No se importa SQLite ni se reinician bases existentes. El historial SQL se conserva solo como referencia de la version anterior.

Los UUID se guardan como cadenas en `_id`, conservando el campo `id` de la API. Las colecciones son `users`, `refresh_sessions`, `training_runs`, `training_checkpoints` y `generation_metrics`. Configuracion, genoma y snapshot son objetos BSON embebidos; el historial creciente utiliza referencias. Las salas multijugador siguen en memoria. Los cinco ejemplos JSON completos y enlazados estan en [docs/mongodb-examples.json](docs/mongodb-examples.json); usan una poblacion tecnica reducida de dos pilotos para mostrar todo el snapshot sin omisiones (la interfaz normal usa 24).

Las pruebas e2e levantan y destruyen un replica set local exclusivo con `mongodb-memory-server`; no usan la base configurada en `.env`. La primera ejecucion descarga el binario oficial de MongoDB.

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

Una cuenta puede mantener varias sesiones simultaneas. Cerrar sesion revoca solo la sesion del navegador actual.

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
