# Despliegue con MongoDB

El backend requiere MongoDB con replica set para guardar checkpoint, metrica y resumen en una transaccion y rotar sesiones de forma consistente. La migracion empieza con una base vacia; no importa SQLite.

## Variables

Copia `.env.production.example` a `.env.production` (Compose) o configura `.env` (Pterodactyl). Define `DATABASE_URL`, secretos JWT distintos y el origen del frontend. No guardes credenciales en Git.

```text
DATABASE_URL=mongodb://USER:PASSWORD@mongo.example.com:27017/synapse?authSource=admin&replicaSet=rs0&directConnection=true
```

Codifica usuario y clave como componentes URI. Ajusta `authSource` a la base donde se creo el usuario. Para produccion el usuario de la aplicacion necesita acceso a la base de Synapse y permiso para crear sus indices; no necesita administrar el replica set. `directConnection=true` sirve para un unico miembro detras de la asignacion de puertos de Pterodactyl. No ofrece conmutacion automatica entre nodos.

## Docker Compose

`compose.yaml` incluye un replica set de desarrollo sin autenticacion, publicado solo en localhost. No expongas ese servicio de desarrollo a Internet. `compose.prod.yaml` usa tu MongoDB externo y publica solo el frontend.

```bash
docker compose --env-file .env.production -f compose.prod.yaml config
docker compose --env-file .env.production -f compose.prod.yaml up -d --build --wait
```

El entrypoint ejecuta `prisma db push --skip-generate`, sin `--accept-data-loss` ni reinicios de base. Si falla la preparacion de indices, no inicia la API. Cambios destructivos futuros requieren un procedimiento especifico revisado por separado.

## Pterodactyl del backend

Importa `deploy/pterodactyl/egg-synapse-mongodb.json`. Copia `start-pterodactyl.sh` a `/home/container/start-pterodactyl.sh`, sube codigo y lockfile, y configura `.env`. El script instala dependencias, genera Prisma, compila y prepara los indices antes de iniciar NestJS.

Para habilitar el replica set del servidor de MongoDB consulta [PTERODACTYL-MONGODB.md](deploy/pterodactyl/PTERODACTYL-MONGODB.md). No ejecutes el backend nuevo contra un MongoDB standalone.

## Verificacion y recuperacion

Comprueba `/api/health/ready`, registro, login, guardado y recuperacion de una generacion. Las pruebas e2e usan una base temporal local y nunca tu servidor externo. Conserva el servidor y los datos SQLite anteriores hasta aprobar el cambio; volver al codigo previo permite seguir usando esa base.

Realiza backups con `mongodump` y comprueba la restauracion con `mongorestore` en una base aparte. Para respaldos consistentes con escrituras concurrentes usa el procedimiento de backup del replica set y su oplog. Un replica set de un nodo permite transacciones, pero no aporta redundancia. Termina TLS en el proxy del frontend y protege la conexion a MongoDB con TLS o una red privada segun tu infraestructura.

## Evitar copias anidadas al subir un ZIP

Descarga la rama `migration/mongodb`, no `main`. Extrae el ZIP y sube el contenido de la carpeta del proyecto directamente a `/home/container`:

```text
/home/container/
  .env
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  nest-cli.json
  tsconfig.json
  tsconfig.build.json
  start-pterodactyl.sh
  src/
  prisma/schema.prisma
```

No mezcles `src/` de una version con `prisma/` de otra. El schema activo debe indicar `provider = "mongodb"`. No subas `node_modules`, `dist` ni archivos `.tsbuildinfo` del equipo local; se generan en el servidor. Conserva tu `.env` privado.

Un error de compilacion que menciona `synapse-backend-main/src/...`, combinado con `$runCommandRaw` inexistente o `bestGenome: null` incompatible, indica que se estan mezclando fuentes y un cliente Prisma relacional. La compilacion ahora incluye solo el directorio raiz `src/`, y el arranque comprueba el schema antes de instalar o generar Prisma. Esto detecta una subida incompleta; no reemplaza los archivos del despliegue automaticamente.
