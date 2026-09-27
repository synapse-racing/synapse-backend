# Despliegue de produccion

## Topologia

`compose.prod.yaml` inicia NestJS con SQLite y el frontend Nginx. Solo Nginx publica un puerto; `/api` y `/socket.io` se envian al backend por la red interna.

El archivo Compose espera que `synapse-backend` y `synapse-frontend` sean directorios hermanos:

```text
workspace/
  synapse-backend/
  synapse-frontend/
```

## Configuracion

Desde `synapse-backend`, crea el archivo de entorno fuera del control de versiones:

```bash
cp .env.production.example .env.production
```

Reemplaza todos los valores de ejemplo. SQLite se guarda en `/app/data/synapse.db`, dentro del volumen `sqlite_data`. `PUBLIC_APP_URL` es el origen HTTPS publico sin ruta final.

Variables obligatorias:

```text
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
PUBLIC_APP_URL
```

## Inicio y actualizacion

Valida y arranca el stack:

```bash
docker compose --env-file .env.production -f compose.prod.yaml config
docker compose --env-file .env.production -f compose.prod.yaml up -d --build --wait
```

El entrypoint del backend ejecuta `prisma migrate deploy` antes de cada inicio. Las migraciones son idempotentes; si una falla, el backend no arranca y conserva el archivo de base de datos.

Comprueba el estado y los logs:

```bash
docker compose --env-file .env.production -f compose.prod.yaml ps
docker compose --env-file .env.production -f compose.prod.yaml logs backend
curl --fail http://localhost/api/health/live
curl --fail http://localhost/api/health/ready
```

## TLS

Termina TLS en un balanceador o proxy externo y reenvia trafico HTTP a `APP_PORT`. Conserva `X-Forwarded-Proto` y configura `PUBLIC_APP_URL` con `https://`; Nest confia solo en el primer proxy. No publiques directamente el puerto del backend.

## Backups

Deten el backend antes de copiar el contenido completo del volumen `sqlite_data` a un respaldo fuera del host. Para restaurar, manten el backend detenido, restaura esos archivos en el mismo volumen y vuelve a iniciarlo. No copies solo el archivo principal mientras hay escrituras activas.

No uses `docker compose down --volumes` en produccion: elimina el volumen persistente.

## Apagado

```bash
docker compose --env-file .env.production -f compose.prod.yaml down
```

Compose concede el periodo configurado para que NestJS cierre HTTP, Prisma y el intervalo multijugador. El volumen SQLite se conserva.

## Pterodactyl

Configura `DATABASE_URL=file:/home/container/data/synapse.db` en `.env`, junto con los secretos y el origen del frontend. Crea el directorio `data` antes de iniciar.

```bash
mkdir -p data
touch data/synapse.db
pnpm prisma:generate
pnpm build
pnpm db:deploy
pnpm start:prod
```

Conserva `data` entre despliegues. Esta version usa una base SQLite vacia y no importa la base PostgreSQL anterior.
