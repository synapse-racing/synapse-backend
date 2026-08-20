# Despliegue de produccion

## Topologia

`compose.prod.yaml` inicia PostgreSQL, NestJS y el frontend Nginx. Solo Nginx publica un puerto; `/api` y `/socket.io` se envian al backend por la red interna.

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

Reemplaza todos los valores de ejemplo. `DATABASE_URL` debe contener la misma contrasena que `POSTGRES_PASSWORD`, codificada para URL cuando incluya caracteres reservados. `PUBLIC_APP_URL` es el origen HTTPS publico sin ruta final.

Variables obligatorias:

```text
POSTGRES_PASSWORD
DATABASE_URL
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

El entrypoint del backend ejecuta `prisma migrate deploy` antes de cada inicio. Las migraciones son idempotentes; si una falla, el backend no arranca y PostgreSQL permanece disponible para diagnostico.

Comprueba el estado y los logs:

```bash
docker compose --env-file .env.production -f compose.prod.yaml ps
docker compose --env-file .env.production -f compose.prod.yaml logs backend
curl --fail http://localhost/api/health/live
curl --fail http://localhost/api/health/ready
```

## TLS

Termina TLS en un balanceador o proxy externo y reenvia trafico HTTP a `APP_PORT`. Conserva `X-Forwarded-Proto` y configura `PUBLIC_APP_URL` con `https://`; Nest confia solo en el primer proxy. No publiques directamente los puertos de backend o PostgreSQL.

## Backups

Realiza backups periodicos fuera del host y verifica restauraciones. Ejemplo manual:

```bash
docker compose --env-file .env.production -f compose.prod.yaml exec -T postgres pg_dump -U synapse -d synapse -Fc > synapse.dump
```

Para restaurar, detiene primero backend, usa una base vacia y ejecuta:

```bash
docker compose --env-file .env.production -f compose.prod.yaml stop backend
docker compose --env-file .env.production -f compose.prod.yaml exec -T postgres pg_restore --clean --if-exists -U synapse -d synapse < synapse.dump
docker compose --env-file .env.production -f compose.prod.yaml start backend
```

No uses `docker compose down --volumes` en produccion: elimina el volumen persistente.

## Apagado

```bash
docker compose --env-file .env.production -f compose.prod.yaml down
```

Compose concede el periodo configurado para que NestJS cierre HTTP, Prisma y el intervalo multijugador. El volumen PostgreSQL se conserva.
